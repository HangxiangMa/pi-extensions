import { basename } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	InputEvent,
	InputEventResult,
} from "@earendil-works/pi-coding-agent";
import { BatchError, BatchStore, digestImages, type ProcessedImage } from "./batch.js";
import { ImageProcessor } from "./images.js";
import {
	type MainMenuAction,
	type MenuLoadResult,
	runImageDropMenuLoad,
	showImageDropHelp,
	showImageDropLimitsMenu,
	showImageDropMainMenu,
	showImageDropSettingsMenu,
	showImageDropStatus,
} from "./menu.js";
import { readEffectivePiImageSettings } from "./pi-settings.js";
import { ImageDropServer, type ImageDropServerOptions } from "./server.js";
import {
	DEFAULT_SETTINGS,
	HARD_LIMITS,
	type ImageDropSettings,
	loadSettings,
	saveSettings,
	settingsFilePath,
} from "./settings.js";

const WIDGET_KEY = "image-drop";

type LatestEventHandler = (event: unknown, ctx: ExtensionContext) => void | Promise<void>;
type LatestExtensionAPI = ExtensionAPI & {
	on(event: "agent_settled", handler: LatestEventHandler): void;
};

type ServerControl = Pick<ImageDropServer, "issueLink" | "broadcastState" | "close"> & {
	hasUnusedLink?: () => boolean;
};
type ProcessorControl = Pick<ImageProcessor, "process">;

export interface RuntimeDependencies {
	loadSettings: typeof loadSettings;
	readPiSettings: typeof readEffectivePiImageSettings;
	startServer(options: ImageDropServerOptions): Promise<ServerControl>;
	createProcessor(): ProcessorControl;
	showMainMenu(
		ctx: ExtensionCommandContext,
		state: {
			batch: ReturnType<BatchStore["publicState"]>;
			history: ReturnType<BatchStore["publicHistoryState"]>;
			serverRunning: boolean;
		},
	): Promise<MainMenuAction>;
	showStatus(
		ctx: ExtensionCommandContext,
		lines: readonly string[],
	): ReturnType<typeof showImageDropStatus>;
	loadStatus<T>(
		ctx: ExtensionCommandContext,
		label: string,
		task: (signal: AbortSignal) => Promise<T>,
	): Promise<MenuLoadResult<T>>;
	showHelp(ctx: ExtensionCommandContext): ReturnType<typeof showImageDropHelp>;
	showSettingsMenu(
		ctx: ExtensionCommandContext,
		options: { lines: readonly string[]; editable: boolean },
	): ReturnType<typeof showImageDropSettingsMenu>;
	showLimitsMenu(
		ctx: ExtensionCommandContext,
		lines: readonly string[],
	): ReturnType<typeof showImageDropLimitsMenu>;
	saveSettings: typeof saveSettings;
	settingsFilePath: typeof settingsFilePath;
}

const DEFAULT_DEPENDENCIES: RuntimeDependencies = {
	loadSettings,
	readPiSettings: readEffectivePiImageSettings,
	startServer: (options) => ImageDropServer.start(options),
	createProcessor: () => new ImageProcessor(2),
	showMainMenu: showImageDropMainMenu,
	showStatus: showImageDropStatus,
	loadStatus: runImageDropMenuLoad,
	showHelp: showImageDropHelp,
	showSettingsMenu: showImageDropSettingsMenu,
	showLimitsMenu: showImageDropLimitsMenu,
	saveSettings,
	settingsFilePath,
};

export class ImageDropRuntime {
	private readonly dependencies: RuntimeDependencies;
	private batch?: BatchStore;
	private settings?: ImageDropSettings;
	private context?: ExtensionContext;
	private server?: ServerControl;
	private serverStarting?: Promise<ServerControl>;
	private processor?: ProcessorControl;
	private sessionAbort = new AbortController();
	private generation = 0;
	private closed = true;
	private lastPiSettingsWarning = "";

	constructor(
		private readonly pi: ExtensionAPI,
		dependencies: Partial<RuntimeDependencies> = {},
	) {
		this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
	}

	register(): void {
		this.pi.registerCommand("image-drop", {
			description: "Open the Image Drop menu",
			handler: async (args, ctx) => {
				if (args.trim()) {
					if (ctx.hasUI) ctx.ui.notify("Usage: /image-drop", "warning");
					return;
				}
				if (ctx.mode !== "tui") {
					if (ctx.hasUI)
						ctx.ui.notify("The Image Drop menu is available in TUI mode only.", "warning");
					return;
				}
				this.context = ctx;
				await this.recoverOrphanedReservation(ctx);
				await this.showMenu(ctx);
			},
		});

		this.pi.on("session_start", async (_event, ctx) => this.start(ctx));
		this.pi.on("session_shutdown", async (_event, ctx) => this.shutdown(ctx));
		this.pi.on("input", async (event, ctx) => this.handleInput(event, ctx));
		this.pi.on("before_agent_start", async () => this.batch?.markPreflightStarted());
		this.pi.on("message_start", async (event, ctx) => this.handleMessageStart(event, ctx));
		(this.pi as LatestExtensionAPI).on("agent_settled", async (_event, ctx) => {
			if (!ctx.isIdle() || ctx.hasPendingMessages()) return;
			await this.recoverReservation(ctx, "Queued image message was not delivered; restored it.");
		});
	}

	async start(ctx: ExtensionContext): Promise<void> {
		const generation = ++this.generation;
		const previousBatch = this.batch;
		this.closed = true;
		this.sessionAbort.abort();
		await this.releaseServer();
		previousBatch?.close();
		if (generation !== this.generation) return;
		const result = await this.dependencies.loadSettings();
		if (generation !== this.generation) return;
		this.settings = result.settings;
		this.batch = new BatchStore(result.settings);
		this.processor = this.dependencies.createProcessor();
		this.sessionAbort = new AbortController();
		this.context = ctx;
		this.closed = false;
		this.lastPiSettingsWarning = "";
		const warning = "warning" in result ? result.warning : undefined;
		if (result.kind === "invalid" || warning) {
			ctx.ui.notify(warning ?? "Image Drop settings ignored.", "warning");
		}
		this.updateWidget(ctx);
		if (!result.settings.startOnSessionStart) return;
		try {
			await this.presentLink(ctx);
		} catch (error) {
			if (generation !== this.generation || this.closed) return;
			ctx.ui.notify(`Image Drop could not start: ${formatError(error)}`, "error");
		}
	}

	async shutdown(ctx: ExtensionContext): Promise<void> {
		const generation = ++this.generation;
		const previousBatch = this.batch;
		this.closed = true;
		this.sessionAbort.abort();
		await this.releaseServer();
		previousBatch?.close();
		if (generation !== this.generation) return;
		this.batch = undefined;
		this.settings = undefined;
		this.processor = undefined;
		this.context = undefined;
		ctx.ui.setWidget(WIDGET_KEY, undefined);
	}

	getBatchForTesting(): BatchStore | undefined {
		return this.batch;
	}

	async handleInput(event: InputEvent, ctx: ExtensionContext): Promise<InputEventResult> {
		this.context = ctx;
		if (this.closed || event.source !== "interactive" || !event.text.trim() || !this.batch) {
			return { action: "continue" };
		}
		if (this.batch.currentReservation()) {
			await this.recoverOrphanedReservation(ctx);
			if (this.batch.currentReservation()) return { action: "continue" };
			// The current input arrived at the recovery boundary. Preserve it alongside the
			// restored text and require an explicit resubmission rather than consuming it.
			this.restoreEditor(ctx, event.text);
			return { action: "handled" };
		}
		const state = this.batch.publicState();
		if (state.phase === "empty") return { action: "continue" };
		if (state.phase !== "ready") {
			this.restoreEditor(ctx, event.text);
			ctx.ui.notify(this.blockedReason(state.phase), "warning");
			return { action: "handled" };
		}
		if (!supportsImages(ctx)) {
			this.restoreEditor(ctx, event.text);
			ctx.ui.notify("The current model does not support image input.", "warning");
			return { action: "handled" };
		}
		const generation = this.generation;
		const batch = this.batch;
		const piSettings = await this.dependencies.readPiSettings(ctx.cwd, ctx.isProjectTrusted());
		if (generation !== this.generation || batch !== this.batch || this.closed) {
			return { action: "handled" };
		}
		this.notifyPiSettingsWarnings(ctx, piSettings.warnings);
		if (piSettings.blockImages) {
			this.restoreEditor(ctx, event.text);
			ctx.ui.notify("Pi image sending is disabled. Enable images in /settings first.", "warning");
			return { action: "handled" };
		}
		if (!(await this.reprocessForAutoResize(piSettings.autoResize, ctx, event.text))) {
			return { action: "handled" };
		}

		try {
			const reservation = batch.reserveMessage(event.text, event.streamingBehavior);
			this.server?.broadcastState();
			this.updateWidget(ctx);
			return {
				action: "transform",
				text: event.text,
				images: [...(event.images ?? []), ...reservation.images],
			};
		} catch (error) {
			this.restoreEditor(ctx, event.text);
			ctx.ui.notify(formatError(error), "warning");
			return { action: "handled" };
		}
	}

	addReadyImageForTesting(
		id: string,
		name: string,
		source: Buffer,
		processed: ProcessedImage,
	): void {
		if (!this.batch) throw new Error("Runtime has not started");
		this.batch.reserveItems([{ id, name, size: source.byteLength }]);
		this.batch.startProcessing(id, source);
		this.batch.complete(id, processed, true);
		this.server?.broadcastState();
		if (this.context) this.updateWidget(this.context);
	}

	private async reprocessForAutoResize(
		autoResize: boolean,
		ctx: ExtensionContext,
		text: string,
	): Promise<boolean> {
		const batch = this.batch;
		const processor = this.processor;
		const settings = this.settings;
		if (!batch || !processor || !settings) return false;
		let jobs: Array<{ id: string; source: Buffer }>;
		try {
			jobs = batch.beginAutoResizeReprocessing(autoResize);
		} catch (error) {
			this.restoreEditor(ctx, text);
			ctx.ui.notify(formatError(error), "warning");
			return false;
		}
		if (jobs.length === 0) return true;
		const generation = this.generation;
		const signal = this.sessionAbort.signal;
		this.server?.broadcastState();
		this.updateWidget(ctx);
		await Promise.all(
			jobs.map(async ({ id, source }) => {
				try {
					const processed = await processor.process(source, {
						autoResize,
						maxImagePixels: settings.maxImagePixels,
						signal,
					});
					if (generation === this.generation) batch.complete(id, processed, autoResize);
				} catch (error) {
					if (generation !== this.generation || signal.aborted) return;
					try {
						batch.fail(id, formatError(error));
					} catch (failure) {
						if (!(failure instanceof BatchError) || failure.code !== "not-found") throw failure;
					}
				} finally {
					if (generation === this.generation) this.server?.broadcastState();
				}
			}),
		);
		if (generation !== this.generation) return false;
		if (batch.publicState().phase !== "ready") {
			this.restoreEditor(ctx, text);
			ctx.ui.notify("Images could not be updated for the current auto-resize setting.", "warning");
			this.updateWidget(ctx);
			return false;
		}
		this.updateWidget(ctx);
		return true;
	}

	private async showMenu(ctx: ExtensionCommandContext): Promise<void> {
		for (;;) {
			const batch = this.batch;
			if (!batch || this.closed) {
				ctx.ui.notify("Image Drop is not ready for this Pi session.", "error");
				return;
			}
			const action = await this.dependencies.showMainMenu(ctx, {
				batch: batch.publicState(),
				history: batch.publicHistoryState(),
				serverRunning: Boolean(this.server),
			});
			if (action === "close") return;
			if (action === "open") {
				try {
					if (await this.presentLink(ctx, true)) return;
				} catch (error) {
					ctx.ui.notify(`Image Drop could not start: ${formatError(error)}`, "error");
				}
				continue;
			}
			if (action === "status") {
				if ((await this.showStatusFlow(ctx)) === "close") return;
				continue;
			}
			if (action === "settings") {
				if ((await this.showSettingsFlow(ctx)) === "close") return;
				continue;
			}
			if ((await this.dependencies.showHelp(ctx)) === "close") return;
		}
	}

	private async showStatusFlow(ctx: ExtensionCommandContext): Promise<"back" | "close"> {
		let previousPiSettings: Awaited<ReturnType<typeof readEffectivePiImageSettings>> | undefined;
		for (;;) {
			const batch = this.batch;
			if (!batch || this.closed) return "close";
			const loaded = await this.dependencies.loadStatus(ctx, "Refreshing Image Drop status…", () =>
				this.dependencies.readPiSettings(ctx.cwd, ctx.isProjectTrusted()),
			);
			if (loaded.kind === "cancelled") return "back";
			let settingsError = "";
			if (loaded.kind === "completed") previousPiSettings = loaded.value;
			else settingsError = `Pi image settings refresh failed — ${formatError(loaded.error)}`;
			const piSettings = previousPiSettings;
			const state = batch.publicState();
			const history = batch.publicHistoryState();
			const lines = [
				`Service: ${this.server ? "Running" : "Not started"}`,
				this.batchStatusLine(state),
				`Sent history: ${history.items.length}/${history.maxImages} images · ${formatBytes(history.totalBytes)}/${formatBytes(history.maxBytes)}`,
				`Current model: ${supportsImages(ctx) ? "Supports images" : "Text only — sending disabled"}`,
				...(piSettings
					? [
							`Pi image sending: ${piSettings.blockImages ? "Disabled in /settings" : "Enabled"}`,
							`Auto-resize: ${piSettings.autoResize ? "On" : "Off"}`,
							...piSettings.warnings.map((warning) => `Warning: ${warning}`),
							...(settingsError
								? [`Warning: ${settingsError}; showing the previous valid state.`]
								: []),
						]
					: [settingsError]),
			];
			const action = await this.dependencies.showStatus(ctx, lines);
			if (action === "close" || action === "back") return action;
			if (action === "refresh") continue;
			try {
				if (await this.presentLink(ctx, true)) return "close";
			} catch (error) {
				ctx.ui.notify(`Image Drop could not start: ${formatError(error)}`, "error");
			}
		}
	}

	private async showSettingsFlow(ctx: ExtensionCommandContext): Promise<"back" | "close"> {
		for (;;) {
			const result = await this.dependencies.loadSettings();
			const invalid = result.kind === "invalid";
			const path = this.dependencies.settingsFilePath();
			const lines = invalid
				? [
						"Settings file: Invalid — editing is disabled",
						"Fix the file and reopen Settings.",
						path,
						result.warning,
					]
				: [
						`Start automatically: ${result.settings.startOnSessionStart ? "On" : "Off"}`,
						`Resource limits: ${usesSafeLimits(result.settings) ? "Safe defaults" : "Custom"}`,
						`Settings file: ${result.kind === "missing" ? "Defaults (not created)" : path}`,
					];
			const action = await this.dependencies.showSettingsMenu(ctx, { lines, editable: !invalid });
			if (action === "close" || action === "back") return action;
			if (action === "toggle-start") {
				const next = {
					...result.settings,
					startOnSessionStart: !result.settings.startOnSessionStart,
				};
				try {
					await this.dependencies.saveSettings(next);
					ctx.ui.notify(
						`Saved. Automatic start is ${next.startOnSessionStart ? "on" : "off"} for future Pi sessions.`,
						"info",
					);
				} catch (error) {
					ctx.ui.notify(
						`Image Drop settings were not saved; the previous settings remain active: ${formatError(error)}`,
						"error",
					);
				}
				continue;
			}
			const outcome = await this.showLimitsFlow(ctx, result.settings);
			if (outcome === "close") return "close";
		}
	}

	private async showLimitsFlow(
		ctx: ExtensionCommandContext,
		original: ImageDropSettings,
	): Promise<"back" | "close"> {
		let draft = { ...original };
		for (;;) {
			const action = await this.dependencies.showLimitsMenu(ctx, limitLines(draft, original));
			if (action === "close" || action === "back") return action;
			if (action === "defaults") {
				draft = {
					...draft,
					...DEFAULT_SETTINGS,
					startOnSessionStart: original.startOnSessionStart,
				};
				continue;
			}
			if (action === "save") {
				const changes = limitChanges(original, draft);
				if (changes.length === 0) {
					ctx.ui.notify("No resource-limit changes to save.", "info");
					continue;
				}
				const confirmed = await ctx.ui.confirm(
					"Save resource limits for future sessions?",
					`${changes.join("\n")}\n\nThese limits apply when the next Pi session starts. Higher limits may increase memory use or provider failures.`,
				);
				if (!confirmed) continue;
				try {
					await this.dependencies.saveSettings(draft);
					ctx.ui.notify("Resource limits saved for future Pi sessions.", "info");
					return "back";
				} catch (error) {
					ctx.ui.notify(
						`Resource limits were not saved; the previous settings remain active: ${formatError(error)}`,
						"error",
					);
					continue;
				}
			}
			const input = await ctx.ui.input(limitPrompt(action), limitInputValue(action, draft));
			if (input === undefined) continue;
			const parsed = parseLimitInput(action, input);
			if (parsed === undefined || parsed > HARD_LIMITS[action]) {
				ctx.ui.notify(`Enter ${limitRange(action)}.`, "warning");
				continue;
			}
			const next = { ...draft, [action]: parsed };
			if (next.maxImageBytes > next.maxBatchBytes) {
				ctx.ui.notify("Size per image cannot exceed the combined draft size.", "warning");
				continue;
			}
			draft = next;
		}
	}

	private batchStatusLine(state: ReturnType<BatchStore["publicState"]>): string {
		const ready = state.items.filter((item) => item.status === "ready").length;
		const processing = state.items.filter(
			(item) => item.status === "uploading" || item.status === "processing",
		).length;
		const errors = state.items.filter((item) => item.status === "error").length;
		if (state.phase === "empty") return "Draft: No images staged";
		if (state.phase === "reserved") return `Draft: ${state.items.length} images queued with Pi`;
		return `Draft: ${ready}/${state.items.length} ready · ${processing} processing · ${errors} need attention · ${formatBytes(state.totalSourceBytes)}`;
	}

	private async presentLink(ctx: ExtensionContext, confirmRotation = false): Promise<boolean> {
		const server = await this.ensureServer(ctx);
		if (
			confirmRotation &&
			server.hasUnusedLink?.() &&
			!(await ctx.ui.confirm(
				"Create a new staging link?",
				"The previous unused Image Drop link will stop working.",
			))
		) {
			return false;
		}
		const link = server.issueLink();
		if (this.batch?.publicState().phase === "empty") {
			ctx.ui.setWidget(WIDGET_KEY, [`🖼️ Image Drop: ${link}`]);
		} else {
			this.updateWidget(ctx);
		}
		ctx.ui.notify(`Image Drop: ${link}`, "info");
		return true;
	}

	private async ensureServer(ctx: ExtensionContext): Promise<ServerControl> {
		if (this.closed || !this.batch || !this.settings || !this.processor) {
			throw new Error("the Pi session is not ready");
		}
		if (this.server) return this.server;
		if (!this.serverStarting) {
			const generation = this.generation;
			const processor = this.processor;
			const starting = this.dependencies.startServer({
				batch: this.batch,
				settings: this.settings,
				projectName: basename(ctx.cwd) || ctx.cwd,
				sessionName: ctx.sessionManager.getSessionName(),
				cwd: ctx.cwd,
				process: (source, options) => processor.process(source, options),
				getAutoResize: () => this.processingSettings(),
				onStateChange: () => {
					if (generation === this.generation && this.context) this.updateWidget(this.context);
				},
			});
			this.serverStarting = starting.then(async (server) => {
				if (generation !== this.generation || this.closed) {
					await server.close();
					throw new Error("the Pi session changed while the server was starting");
				}
				this.server = server;
				return server;
			});
		}
		const starting = this.serverStarting;
		try {
			return await starting;
		} finally {
			if (this.serverStarting === starting) this.serverStarting = undefined;
		}
	}

	private async processingSettings(): Promise<boolean> {
		const ctx = this.context;
		if (!ctx || this.closed) throw new Error("The Pi session has ended.");
		if (!supportsImages(ctx)) throw new Error("The current model does not support image input.");
		const settings = await this.dependencies.readPiSettings(ctx.cwd, ctx.isProjectTrusted());
		this.notifyPiSettingsWarnings(ctx, settings.warnings);
		if (settings.blockImages) {
			throw new Error("Pi image sending is disabled. Enable images in /settings first.");
		}
		return settings.autoResize;
	}

	private async releaseServer(): Promise<void> {
		const server = this.server;
		const starting = this.serverStarting;
		this.server = undefined;
		this.serverStarting = undefined;
		if (server) await server.close();
		if (starting) {
			try {
				await (await starting).close();
			} catch {
				// A failed or stale startup has no live server left to release.
			}
		}
	}

	private async handleMessageStart(event: unknown, ctx: ExtensionContext): Promise<void> {
		this.context = ctx;
		const reservation = this.batch?.currentReservation();
		if (!reservation) return;
		const images = userMessageImages(event);
		if (!containsImageSequence(images, reservation.images.length, reservation.digest)) return;
		this.batch?.commitReservation(reservation.digest);
		this.server?.broadcastState();
		this.updateWidget(ctx);
	}

	private async recoverOrphanedReservation(ctx: ExtensionContext): Promise<void> {
		if (!this.batch?.currentReservation()) return;
		if (!ctx.isIdle() || ctx.hasPendingMessages()) return;
		await this.recoverReservation(ctx, "Restored an image message that did not start.");
	}

	private async recoverReservation(ctx: ExtensionContext, notice: string): Promise<void> {
		const restored = this.batch?.restoreReservation();
		if (!restored) return;
		this.restoreEditor(ctx, restored.text);
		this.server?.broadcastState();
		this.updateWidget(ctx);
		ctx.ui.notify(notice, "warning");
	}

	private restoreEditor(ctx: ExtensionContext, text: string): void {
		try {
			const current = ctx.ui.getEditorText();
			const restored = !current.trim() || current === text ? text : `${current}\n\n${text}`;
			ctx.ui.setEditorText(restored);
		} catch {
			// Session replacement can invalidate a captured UI context; state cleanup still proceeds.
		}
	}

	private updateWidget(ctx: ExtensionContext): void {
		const state = this.batch?.publicState();
		if (!state || state.phase === "empty" || state.phase === "closed") {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		const ready = state.items.filter((item) => item.status === "ready").length;
		const uploading = state.items.filter(
			(item) => item.status === "uploading" || item.status === "processing",
		).length;
		const errors = state.items.filter((item) => item.status === "error").length;
		let text = `🖼️ ${ready}/${state.items.length} images ready`;
		if (uploading > 0) text += ` · ${uploading} uploading`;
		if (errors > 0) text += ` · ${errors} need attention`;
		if (state.phase === "reserved") text = `🖼️ ${state.items.length} images queued`;
		ctx.ui.setWidget(WIDGET_KEY, [text]);
	}

	private notifyPiSettingsWarnings(ctx: ExtensionContext, warnings: string[]): void {
		const message = warnings.join("\n");
		if (!message) {
			this.lastPiSettingsWarning = "";
			return;
		}
		if (message === this.lastPiSettingsWarning) return;
		this.lastPiSettingsWarning = message;
		ctx.ui.notify(message, "warning");
	}

	private blockedReason(phase: string): string {
		return phase === "blocked"
			? "Resolve or delete failed images before sending."
			: "Wait for every image to finish uploading before sending.";
	}
}

const MIB = 1024 * 1024;
const LIMIT_KEYS = [
	"maxImages",
	"maxImageBytes",
	"maxBatchBytes",
	"maxImagePixels",
	"maxRetainedImages",
	"maxRetainedBytes",
] as const;
type LimitKey = (typeof LIMIT_KEYS)[number];

function usesSafeLimits(settings: ImageDropSettings): boolean {
	return LIMIT_KEYS.every((key) => settings[key] === DEFAULT_SETTINGS[key]);
}

function limitLines(settings: ImageDropSettings, original: ImageDropSettings): string[] {
	return [
		`Images per draft: ${settings.maxImages}`,
		`Size per image: ${formatBytes(settings.maxImageBytes)}`,
		`Combined draft size: ${formatBytes(settings.maxBatchBytes)}`,
		`Decoded pixels: ${formatCount(settings.maxImagePixels)}`,
		`Retained history: ${settings.maxRetainedImages} images · ${formatBytes(settings.maxRetainedBytes)}`,
		limitChanges(original, settings).length > 0
			? `${limitChanges(original, settings).length} unsaved change(s)`
			: "No unsaved changes",
	];
}

function limitChanges(original: ImageDropSettings, draft: ImageDropSettings): string[] {
	return LIMIT_KEYS.filter((key) => original[key] !== draft[key]).map(
		(key) =>
			`${limitLabel(key)}: ${formatLimit(key, original[key])} → ${formatLimit(key, draft[key])}`,
	);
}

function limitPrompt(key: LimitKey): string {
	const unit = byteLimit(key) ? "MiB" : key === "maxImagePixels" ? "megapixels" : "images";
	return `${limitLabel(key)} (${unit})`;
}

function limitInputValue(key: LimitKey, settings: ImageDropSettings): string {
	const value = settings[key];
	if (byteLimit(key)) return String(value / MIB);
	if (key === "maxImagePixels") return String(value / 1_000_000);
	return String(value);
}

function parseLimitInput(key: LimitKey, input: string): number | undefined {
	const value = Number(input.trim());
	if (!Number.isFinite(value) || value <= 0) return undefined;
	const scaled = byteLimit(key)
		? value * MIB
		: key === "maxImagePixels"
			? value * 1_000_000
			: value;
	return Number.isSafeInteger(scaled) ? scaled : undefined;
}

function limitRange(key: LimitKey): string {
	return `a positive value no greater than ${formatLimit(key, HARD_LIMITS[key])}`;
}

function limitLabel(key: LimitKey): string {
	return {
		maxImages: "Images per draft",
		maxImageBytes: "Size per image",
		maxBatchBytes: "Combined draft size",
		maxImagePixels: "Decoded pixels",
		maxRetainedImages: "Retained history images",
		maxRetainedBytes: "Retained history size",
	}[key];
}

function formatLimit(key: LimitKey, value: number): string {
	if (byteLimit(key)) return formatBytes(value);
	return key === "maxImagePixels" ? formatCount(value) : String(value);
}

function byteLimit(key: LimitKey): boolean {
	return key === "maxImageBytes" || key === "maxBatchBytes" || key === "maxRetainedBytes";
}

function formatBytes(value: number): string {
	if (value < 1024) return `${value} B`;
	if (value < MIB) return `${Math.round(value / 1024)} KiB`;
	return `${Number((value / MIB).toFixed(1))} MiB`;
}

function formatCount(value: number): string {
	return value >= 1_000_000
		? `${Number((value / 1_000_000).toFixed(1))} megapixels`
		: String(value);
}

function supportsImages(ctx: ExtensionContext): boolean {
	return ctx.model?.input.includes("image") ?? false;
}

function userMessageImages(event: unknown): ImageContent[] {
	if (!isRecord(event) || !isRecord(event.message) || event.message.role !== "user") return [];
	const content = event.message.content;
	if (!Array.isArray(content)) return [];
	return content.filter(isImageContent);
}

function containsImageSequence(images: ImageContent[], length: number, digest: string): boolean {
	for (let start = 0; start + length <= images.length; start += 1) {
		if (digestImages(images.slice(start, start + length)) === digest) return true;
	}
	return false;
}

function isImageContent(value: unknown): value is ImageContent {
	return (
		isRecord(value) &&
		value.type === "image" &&
		typeof value.data === "string" &&
		typeof value.mimeType === "string"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
	if (error instanceof BatchError || error instanceof Error) return error.message;
	return String(error);
}
