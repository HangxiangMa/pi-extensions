import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";
import type { PreparedAttachment } from "./attachments.js";
import { ConversationProjection, projectBranchMessages } from "./conversation.js";
import { DEFAULT_IMAGE_LIMITS, type ImageLimits, imageLimits } from "./image-limits.js";
import {
	type BrowserImageInput,
	type ProcessBrowserImageOptions,
	type ProcessedBrowserImage,
	processBrowserImages,
	processStagedImage,
	validateStagedBrowserImages,
} from "./images.js";
import {
	createWebUIDetailComponent,
	createWebUIMenuComponent,
	safeTerminalText,
	type WebUIMenuAction,
	type WebUIMenuState,
	webUIMenuItems,
	webUIMenuTitle,
} from "./menu.js";
import { type EffectivePiImageSettings, readEffectivePiImageSettings } from "./pi-settings.js";
import {
	type WebSendRequest,
	type WebSendResult,
	WebUIServer,
	type WebUIServerOptions,
} from "./server.js";
import {
	DEFAULT_SETTINGS,
	initializeSettings,
	loadSettings,
	type SettingsLoadResult,
	saveSettings,
	type WebUISettings,
} from "./settings.js";

const WIDGET_KEY = "webui";
const ACTIVITY_STATUS_KEY = "webui:activity";
const EXPERIMENTAL_WARNING =
	"pi-webui is experimental; its browser workflow and package API may change.";
const INPUT_HEADER = /^<pi-webui-input nonce="([0-9a-f-]+)">\n/;
const INPUT_FOOTER = "\n</pi-webui-input>";
const COMMAND_USAGE = "Usage: /webui [open|settings|status|help|init]";
const COMMAND_COMPLETIONS = [
	{ value: "open", label: "open", description: "Open WebUI and display a fresh link" },
	{ value: "settings", label: "settings", description: "Open WebUI settings" },
	{ value: "status", label: "status", description: "Show effective WebUI settings and state" },
	{ value: "help", label: "help", description: "Show WebUI command help" },
	{ value: "init", label: "init", description: "Create the default WebUI settings file" },
];

type ServerControl = Pick<WebUIServer, "issueLink" | "close">;
type LatestEventHandler = (event: unknown, ctx: ExtensionContext) => void | Promise<void>;
type LatestExtensionAPI = ExtensionAPI & {
	on(event: "agent_settled", handler: LatestEventHandler): void;
};

interface PendingBrowserInput {
	resolve(): void;
	reject(error: Error): void;
	text: string;
	retainedImageIds: string[];
}

interface AcceptedBrowserInput {
	text: string;
	retainedImageIds: string[];
}

export interface RuntimeDependencies {
	loadSettings: typeof loadSettings;
	saveSettings: typeof saveSettings;
	initializeSettings: typeof initializeSettings;
	startServer(options: WebUIServerOptions): Promise<ServerControl>;
	readPiSettings(cwd: string, projectTrusted: boolean): Promise<EffectivePiImageSettings>;
	processImages(
		inputs: BrowserImageInput[],
		options?: ProcessBrowserImageOptions,
	): Promise<ImageContent[]>;
	processAttachment(
		source: Uint8Array,
		options?: ProcessBrowserImageOptions,
	): Promise<ProcessedBrowserImage>;
}

const DEFAULT_DEPENDENCIES: RuntimeDependencies = {
	loadSettings,
	saveSettings,
	initializeSettings,
	startServer: (options) => WebUIServer.start(options),
	readPiSettings: readEffectivePiImageSettings,
	processImages: processBrowserImages,
	processAttachment: processStagedImage,
};

export class WebUIRuntime {
	private readonly dependencies: RuntimeDependencies;
	private context?: ExtensionContext;
	private conversation?: ConversationProjection;
	private server?: ServerControl;
	private serverStarting?: Promise<ServerControl>;
	private sessionAbort = new AbortController();
	private generation = 0;
	private closed = true;
	private lastSettingsWarning = "";
	private nextLiveMessageId = 0;
	private readonly activeMessageIds = new Map<string, string>();
	private readonly finalMessageTimers = new Set<ReturnType<typeof setTimeout>>();
	private readonly pendingBrowserInputs = new Map<string, PendingBrowserInput>();
	private readonly acceptedBrowserInputs = new Map<string, AcceptedBrowserInput>();
	private settings: WebUISettings = { ...DEFAULT_SETTINGS };
	private effectiveImageLimits: Readonly<ImageLimits> = DEFAULT_IMAGE_LIMITS;
	private settingsDocument?: Record<string, unknown> = {};
	private settingsPath = "pi-webui.json";
	private settingsSource: SettingsLoadResult["source"] = "defaults";
	private settingsSaveQueue: Promise<void> = Promise.resolve();
	private activityId = 0;

	constructor(
		private readonly pi: ExtensionAPI,
		dependencies: Partial<RuntimeDependencies> = {},
	) {
		this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
	}

	register(): void {
		this.pi.registerCommand("webui", {
			description: "Manage the local web companion for this Pi session",
			getArgumentCompletions: (prefix) => {
				const normalized = prefix.trimStart().toLowerCase();
				if (/\s/.test(normalized)) return null;
				const matches = COMMAND_COMPLETIONS.filter((item) => item.value.startsWith(normalized));
				return matches.length > 0 ? matches : null;
			},
			handler: async (args, ctx) => {
				this.context = ctx;
				const action = args.trim().toLowerCase();
				try {
					if (!action) {
						await this.showMenu(ctx);
						return;
					}
					if (action === "open") {
						await this.openWebUI(ctx);
						return;
					}
					if (action === "settings") {
						await this.showSettings(ctx);
						return;
					}
					if (action === "status") {
						this.showStatus(ctx);
						return;
					}
					if (action === "help") {
						this.showHelp(ctx);
						return;
					}
					if (action === "init") {
						await this.initializeSettings(ctx);
						return;
					}
					if (ctx.hasUI) ctx.ui.notify(COMMAND_USAGE, "warning");
				} catch (error) {
					if (ctx.hasUI) {
						const message = `Pi WebUI command failed: ${formatError(error)}`;
						ctx.ui.notify(
							action === "open" || !action ? `${message}. Retry with /webui open.` : message,
							"error",
						);
					}
				}
			},
		});

		this.pi.on("session_start", async (_event, ctx) => this.start(ctx));
		this.pi.on("session_shutdown", async (_event, ctx) => this.shutdown(ctx));
		this.pi.on("session_tree", async (_event, ctx) => {
			this.captureContext(ctx);
			this.cancelPendingMessages();
			this.conversation?.replaceBranch(projectBranchMessages(ctx.sessionManager.getBranch()));
		});
		this.pi.on("session_info_changed", async (event, ctx) => {
			this.captureContext(ctx);
			this.conversation?.updateSession({ name: event.name });
		});
		this.pi.on("input", (event) => {
			if (event.source !== "extension") return;
			// Keep the envelope through later handlers so copied internal markers remain browser-originated.
			const wrapped = parseBrowserInput(event.text);
			if (!wrapped) return;
			const pending = this.pendingBrowserInputs.get(wrapped.nonce);
			if (!pending) return;
			this.acceptedBrowserInputs.set(wrapped.nonce, {
				text: pending.text,
				retainedImageIds: [...pending.retainedImageIds],
			});
			this.settleBrowserInput(wrapped.nonce);
		});
		this.pi.on("message_start", async (event, ctx) => {
			this.captureContext(ctx);
			this.recordMessage(
				"start",
				sanitizeBrowserMessageEvent(event, this.acceptedBrowserInputs, false),
			);
		});
		this.pi.on("message_update", async (event, ctx) => {
			this.captureContext(ctx);
			this.recordMessage("update", event);
		});
		this.pi.on("message_end", async (event, ctx) => {
			this.captureContext(ctx);
			const sanitized = sanitizeBrowserMessageEvent(event, this.acceptedBrowserInputs, true);
			this.recordMessage("end", sanitized);
			// Pi applies this replacement before persistence and before the prompt reaches the model.
			if (sanitized !== event && isRecord(sanitized) && isRecord(sanitized.message)) {
				return { message: sanitized.message as unknown as typeof event.message };
			}
		});
		this.pi.on("tool_execution_start", async (event, ctx) => {
			this.captureContext(ctx);
			this.recordTool("start", event);
		});
		this.pi.on("tool_execution_update", async (event, ctx) => {
			this.captureContext(ctx);
			this.recordTool("update", event);
		});
		this.pi.on("tool_execution_end", async (event, ctx) => {
			this.captureContext(ctx);
			this.recordTool("end", event);
		});
		this.pi.on("agent_start", async (_event, ctx) => {
			this.captureContext(ctx);
			this.conversation?.setActivity("running");
		});
		(this.pi as LatestExtensionAPI).on("agent_settled", async (_event, ctx) => {
			this.captureContext(ctx);
			if (ctx.isIdle() && !ctx.hasPendingMessages()) {
				this.acceptedBrowserInputs.clear();
				this.conversation?.setActivity("idle");
			}
		});
	}

	async start(ctx: ExtensionContext): Promise<void> {
		const generation = ++this.generation;
		const previousConversation = this.conversation;
		this.closed = true;
		this.sessionAbort.abort();
		this.cancelPendingMessages();
		this.cancelBrowserInputs("The Pi session changed before the browser prompt was accepted.");
		this.acceptedBrowserInputs.clear();
		previousConversation?.close();
		await this.releaseServer();
		if (generation !== this.generation) return;
		await this.settingsSaveQueue;
		if (generation !== this.generation) return;
		const settingsResult = await this.dependencies.loadSettings();
		if (generation !== this.generation) return;
		this.applySettingsResult(settingsResult);
		this.sessionAbort = new AbortController();
		this.context = ctx;
		this.conversation = new ConversationProjection(
			{
				id: ctx.sessionManager.getSessionId(),
				cwd: ctx.cwd,
				projectName: basename(ctx.cwd) || ctx.cwd,
				...(ctx.sessionManager.getSessionName()
					? { name: ctx.sessionManager.getSessionName() }
					: {}),
			},
			projectBranchMessages(ctx.sessionManager.getBranch()),
		);
		this.closed = false;
		this.lastSettingsWarning = "";
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		this.activityId += 1;
		ctx.ui.setStatus(ACTIVITY_STATUS_KEY, undefined);
		if (ctx.hasUI) ctx.ui.notify(EXPERIMENTAL_WARNING, "warning");
		if (settingsResult.warning) ctx.ui.notify(settingsResult.warning, "warning");
		if (!this.settings.startOnSessionStart) return;
		try {
			await this.presentLink(ctx);
		} catch (error) {
			if (generation !== this.generation || this.closed) return;
			ctx.ui.notify(`Pi WebUI could not start: ${formatError(error)}`, "error");
		}
	}

	async shutdown(ctx: ExtensionContext): Promise<void> {
		const generation = ++this.generation;
		this.closed = true;
		this.sessionAbort.abort();
		this.cancelPendingMessages();
		this.cancelBrowserInputs("The Pi session ended before the browser prompt was accepted.");
		this.acceptedBrowserInputs.clear();
		this.conversation?.close();
		await this.settingsSaveQueue;
		if (generation !== this.generation) return;
		await this.releaseServer();
		if (generation !== this.generation) return;
		this.context = undefined;
		this.conversation = undefined;
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		this.activityId += 1;
		ctx.ui.setStatus(ACTIVITY_STATUS_KEY, undefined);
	}

	private captureContext(ctx: ExtensionContext): void {
		if (!this.closed) this.context = ctx;
	}

	private recordMessage(phase: "start" | "update" | "end", event: unknown): void {
		if (!isRecord(event) || !isRecord(event.message) || typeof event.message.role !== "string") {
			return;
		}
		const key = messageLifecycleKey(event.message);
		let id = this.activeMessageIds.get(key);
		if (phase === "start" || !id) {
			id = `web-live:${++this.nextLiveMessageId}`;
			this.activeMessageIds.set(key, id);
		}
		const retainedImageIds = Array.isArray(event.retainedImageIds)
			? event.retainedImageIds.filter((value): value is string => typeof value === "string")
			: [];
		if (phase !== "end") {
			this.recordProjectedMessage(event.message, false, id, retainedImageIds);
			return;
		}
		this.activeMessageIds.delete(key);
		const generation = this.generation;
		const timer = setTimeout(() => {
			this.finalMessageTimers.delete(timer);
			if (generation !== this.generation || this.closed) return;
			this.recordProjectedMessage(event.message, true, id, retainedImageIds);
		}, 0);
		this.finalMessageTimers.add(timer);
	}

	private recordProjectedMessage(
		message: unknown,
		final: boolean,
		id: string,
		retainedImageIds: readonly string[] = [],
	): void {
		try {
			this.conversation?.recordMessage(message, final, id, retainedImageIds);
		} catch {
			// Unknown custom message shapes do not block the supported transcript.
		}
	}

	private cancelPendingMessages(): void {
		this.activeMessageIds.clear();
		for (const timer of this.finalMessageTimers) clearTimeout(timer);
		this.finalMessageTimers.clear();
	}

	private recordTool(phase: "start" | "update" | "end", event: unknown): void {
		if (
			!isRecord(event) ||
			typeof event.toolCallId !== "string" ||
			typeof event.toolName !== "string"
		)
			return;
		const result =
			phase === "update" ? event.partialResult : phase === "end" ? event.result : undefined;
		this.conversation?.recordTool(
			phase,
			event.toolCallId,
			event.toolName,
			event.args,
			result,
			typeof event.isError === "boolean" ? event.isError : undefined,
		);
	}

	private async presentLink(ctx: ExtensionContext): Promise<void> {
		const server = await this.ensureServer();
		const link = server.issueLink();
		ctx.ui.setWidget(WIDGET_KEY, [`🌐 Pi WebUI: ${link}`]);
		ctx.ui.notify(`Pi WebUI: ${link}`, "info");
	}

	private async openWebUI(ctx: ExtensionCommandContext): Promise<void> {
		if (ctx.mode === "print" || ctx.mode === "json") return;
		const activityId = ++this.activityId;
		ctx.ui.setStatus(
			ACTIVITY_STATUS_KEY,
			this.server ? "Creating fresh WebUI link…" : "Starting WebUI…",
		);
		try {
			await this.presentLink(ctx);
		} finally {
			if (activityId === this.activityId) {
				ctx.ui.setStatus(ACTIVITY_STATUS_KEY, undefined);
			}
		}
	}

	private menuState(): WebUIMenuState {
		return {
			serverRunning: this.server !== undefined,
			startupAutomatic: this.settings.startOnSessionStart,
			settingsSource:
				this.settingsDocument === undefined
					? "Defaults (invalid file ignored)"
					: this.settingsSource === "settings file"
						? "Settings file"
						: "Defaults",
			settingsPath: this.settingsPath,
			settingsInvalid: this.settingsDocument === undefined,
		};
	}

	private async showMenu(ctx: ExtensionCommandContext): Promise<void> {
		if (!ctx.hasUI) return;
		const generation = this.generation;
		let selectedAction: WebUIMenuAction | undefined;
		while (generation === this.generation) {
			const state = this.menuState();
			let action: WebUIMenuAction | undefined;
			if (ctx.mode === "tui") {
				action = await ctx.ui.custom<WebUIMenuAction | undefined>(
					(tui, theme, _keybindings, done) =>
						createWebUIMenuComponent(state, tui, theme, done, selectedAction),
				);
			} else {
				const items = webUIMenuItems(state);
				const options = items.map((item) => `${item.label} — ${item.description ?? ""}`);
				const selected = await ctx.ui.select(webUIMenuTitle(state), options);
				const selectedIndex = selected === undefined ? -1 : options.indexOf(selected);
				action = items[selectedIndex]?.value;
			}
			if (generation !== this.generation || !action) return;
			selectedAction = action;
			if (action === "open") {
				await this.openWebUI(ctx);
				return;
			}
			if (action === "settings") {
				await this.showSettings(ctx);
				if (generation !== this.generation) return;
				continue;
			}
			if (action === "repair") {
				await this.showDetail(ctx, "Repair WebUI settings", this.repairLines());
				if (generation !== this.generation) return;
				continue;
			}
			if (action === "status") {
				await this.showDetail(ctx, "Pi WebUI status", this.statusLines());
				if (generation !== this.generation) return;
				continue;
			}
			await this.showDetail(ctx, "Pi WebUI help", this.helpLines());
			if (generation !== this.generation) return;
		}
	}

	private async showDetail(
		ctx: ExtensionCommandContext,
		title: string,
		lines: readonly string[],
	): Promise<void> {
		if (ctx.mode === "tui") {
			await ctx.ui.custom<void>((tui, theme, keybindings, done) =>
				createWebUIDetailComponent(title, lines, tui, theme, keybindings, done),
			);
			return;
		}
		await ctx.ui.select([title, "", ...lines].join("\n"), ["Back"]);
	}

	private async showSettings(ctx: ExtensionCommandContext): Promise<void> {
		if (this.settingsDocument === undefined) {
			if (ctx.mode === "tui") {
				await this.showDetail(ctx, "Repair WebUI settings", this.repairLines());
			} else if (ctx.hasUI) {
				ctx.ui.notify(this.repairLines().join("\n"), "warning");
			}
			return;
		}
		if (ctx.mode !== "tui") {
			if (ctx.hasUI) {
				ctx.ui.notify(`Edit WebUI settings manually: ${this.settingsPath}`, "info");
			}
			return;
		}

		const settingsGeneration = this.generation;
		const items: SettingItem[] = [
			{
				id: "startOnSessionStart",
				label: "Start WebUI automatically",
				description: "Choose whether future Pi session initializations display a WebUI link",
				currentValue: this.settings.startOnSessionStart ? "Every session" : "Manual",
				values: ["Manual", "Every session"],
			},
		];

		await ctx.ui.custom((tui, theme, _keybindings, done) => {
			const container = new Container();
			const title = new Text(theme.fg("accent", theme.bold("Pi WebUI Settings")), 1, 1);
			container.addChild(title);
			container.addChild(
				new Text(
					`Changes save immediately. Startup changes apply on the next session initialization or reload.\nAdvanced settings: ${safeTerminalText(this.settingsPath)}`,
					1,
					0,
				),
			);
			const list = new SettingsList(
				items,
				Math.min(items.length + 2, 15),
				getSettingsListTheme(),
				(id, value) => {
					if (id !== "startOnSessionStart") return;
					const requested = value === "Every session";
					const operation = this.settingsSaveQueue.then(async () => {
						const previous = this.settings.startOnSessionStart;
						try {
							if (!this.settingsDocument) {
								throw new Error("the invalid settings file must be repaired manually first");
							}
							const next = { ...this.settings, startOnSessionStart: requested };
							const document = await this.dependencies.saveSettings(
								{ startOnSessionStart: requested },
								this.settingsDocument,
								this.settingsPath,
							);
							if (settingsGeneration !== this.generation || this.closed) return;
							this.settings = next;
							this.settingsDocument = document;
							this.settingsSource = "settings file";
						} catch (error) {
							if (settingsGeneration === this.generation) {
								list.updateValue(id, previous ? "Every session" : "Manual");
								ctx.ui.notify(`WebUI settings save failed: ${formatError(error)}`, "error");
								tui.requestRender();
							}
						}
					});
					this.settingsSaveQueue = operation.catch(() => undefined);
				},
				() => done(undefined),
				{ enableSearch: false },
			);
			container.addChild(list);
			return {
				render: (width: number) => container.render(width),
				invalidate: () => {
					title.setText(theme.fg("accent", theme.bold("Pi WebUI Settings")));
					container.invalidate();
				},
				handleInput(data: string) {
					list.handleInput?.(data);
					tui.requestRender();
				},
			};
		});
		await this.settingsSaveQueue;
	}

	private statusLines(): string[] {
		const source =
			this.settingsDocument === undefined ? "Defaults (invalid file ignored)" : this.settingsSource;
		return [
			`Server: ${this.server ? "Running" : "Stopped"}`,
			`Startup: ${this.settings.startOnSessionStart ? "Every session" : "Manual"} (${source})`,
			`Image limits (${source}): ${this.effectiveImageLimits.maxImages} images, ${formatMib(this.effectiveImageLimits.maxImageBytes)}/image, ${formatMib(this.effectiveImageLimits.maxBatchBytes)}/batch, ${this.effectiveImageLimits.maxImagePixels.toLocaleString("en-US")} pixels/image`,
			`Settings: ${safeTerminalText(this.settingsPath)}`,
		];
	}

	private showStatus(ctx: ExtensionCommandContext): void {
		if (!ctx.hasUI) return;
		ctx.ui.notify(["Pi WebUI status", ...this.statusLines()].join("\n"), "info");
	}

	private helpLines(): string[] {
		return [
			COMMAND_USAGE,
			"/webui: open the current-state menu",
			"open: start or reuse the current session server and display a fresh one-time link",
			"settings: edit WebUI settings in TUI mode",
			"status: show effective settings, source, path, and current server state",
			"init: create the defaults file without overwriting existing content",
			'Accepted JSON starts with { "startOnSessionStart": false } and may include advanced maxImages, maxImageBytes, maxBatchBytes, and maxImagePixels fields.',
			`Settings path: ${safeTerminalText(this.settingsPath)}`,
			"Image byte/pixel limits stay in Advanced JSON; Pi provider-ready dimension/Base64 limits are fixed.",
			"Settings changes save immediately; startup changes apply on the next session initialization or reload.",
		];
	}

	private repairLines(): string[] {
		return [
			"The settings file is invalid and was preserved without changes.",
			"Safe defaults remain active; settings writes are paused.",
			`File: ${safeTerminalText(this.settingsPath)}`,
			"Repair the JSON file, then run /reload before editing settings again.",
		];
	}

	private showHelp(ctx: ExtensionCommandContext): void {
		if (!ctx.hasUI) return;
		ctx.ui.notify(this.helpLines().join("\n"), "info");
	}

	private async initializeSettings(ctx: ExtensionCommandContext): Promise<void> {
		const generation = this.generation;
		let result: "created" | "exists";
		try {
			result = await this.dependencies.initializeSettings(this.settingsPath);
		} catch (error) {
			if (generation !== this.generation || this.closed) return;
			throw error;
		}
		if (generation !== this.generation || this.closed) return;
		if (ctx.hasUI) {
			ctx.ui.notify(
				result === "created"
					? `Created WebUI settings: ${this.settingsPath}`
					: `WebUI settings already exists and was not overwritten: ${this.settingsPath}`,
				"info",
			);
		}
		const loaded = await this.dependencies.loadSettings(this.settingsPath);
		if (generation !== this.generation || this.closed) return;
		this.applySettingsResult(loaded);
		if (loaded.warning && ctx.hasUI) ctx.ui.notify(loaded.warning, "warning");
		if (ctx.mode === "tui") await this.showSettings(ctx);
	}

	private applySettingsResult(result: SettingsLoadResult): void {
		this.settings = { ...result.settings };
		this.effectiveImageLimits = imageLimits(result.settings);
		this.settingsDocument = result.kind === "invalid" ? undefined : { ...(result.document ?? {}) };
		this.settingsPath = result.path;
		this.settingsSource = result.source;
	}

	private async ensureServer(): Promise<ServerControl> {
		if (this.closed || !this.conversation) throw new Error("the Pi session is not ready");
		if (this.server) return this.server;
		if (!this.serverStarting) {
			const generation = this.generation;
			const conversation = this.conversation;
			const starting = this.dependencies.startServer({
				conversation,
				send: (request) => this.sendBrowserMessage(request, generation),
				imageLimits: this.effectiveImageLimits,
				sentImageSettings: {
					enabled: this.settings.retainSentImages,
					maxImages: this.settings.maxRetainedImages,
					maxBytes: this.settings.maxRetainedBytes,
				},
				processAttachment: (source, signal) =>
					this.processStagedAttachment(source, generation, signal),
			});
			this.serverStarting = starting.then(async (server) => {
				if (generation !== this.generation || this.closed || conversation !== this.conversation) {
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

	private async processStagedAttachment(
		source: Uint8Array,
		generation: number,
		signal?: AbortSignal,
	): Promise<PreparedAttachment> {
		const ctx = this.context;
		if (!ctx || this.closed || generation !== this.generation) {
			throw new Error("The Pi session has ended.");
		}
		const combinedSignal = signal
			? AbortSignal.any([this.sessionAbort.signal, signal])
			: this.sessionAbort.signal;
		const settings = await this.dependencies.readPiSettings(ctx.cwd, ctx.isProjectTrusted());
		this.notifySettingsWarnings(ctx, settings.warnings);
		const image = await this.dependencies.processAttachment(source, {
			maxImageBytes: this.effectiveImageLimits.maxImageBytes,
			maxPixels: this.effectiveImageLimits.maxImagePixels,
			autoResize: settings.autoResize,
			blockImages: settings.blockImages,
			supportsImages: ctx.model?.input.includes("image") ?? false,
			signal: combinedSignal,
		});
		if (combinedSignal.aborted || generation !== this.generation || this.closed) {
			throw new Error("Image processing was cancelled.");
		}
		return {
			...image,
			notes: attachmentNotes(image),
		};
	}

	private async sendBrowserMessage(
		request: WebSendRequest,
		generation: number,
	): Promise<WebSendResult> {
		const ctx = this.context;
		if (!ctx || this.closed || generation !== this.generation) {
			throw new Error("The Pi session has ended.");
		}

		const signal = request.signal
			? AbortSignal.any([this.sessionAbort.signal, request.signal])
			: this.sessionAbort.signal;
		if (signal.aborted) throw new Error("The browser message was cancelled.");
		await this.preflightIdlePrompt(ctx, request, generation, signal);
		let images: ImageContent[] = [];
		if (request.images.length > 0) {
			validateStagedBrowserImages(request.images, this.effectiveImageLimits);
			const settings = await this.dependencies.readPiSettings(ctx.cwd, ctx.isProjectTrusted());
			this.notifySettingsWarnings(ctx, settings.warnings);
			if (settings.blockImages) throw new Error("Pi image sending is disabled.");
			await this.validateCurrentModel(ctx, generation, signal, true);
			images = request.images.map((image) => ({
				type: "image" as const,
				data: image.data,
				mimeType: image.mimeType ?? "image/png",
			}));
		}
		if (signal.aborted) throw new Error("The browser message was cancelled.");
		if (!this.context || this.closed || generation !== this.generation) {
			throw new Error("The Pi session changed while the message was being prepared.");
		}

		const text = request.text;
		const content: string | Array<TextContent | ImageContent> =
			images.length === 0
				? text
				: [...(text.trim() ? ([{ type: "text", text }] satisfies TextContent[]) : []), ...images];
		const wrapped = this.createBrowserInput(content, request.retainedImageIds ?? []);
		const delivery =
			request.delivery === "steer"
				? "steer"
				: !ctx.isIdle() || ctx.hasPendingMessages()
					? "followUp"
					: "immediate";
		try {
			this.pi.sendUserMessage(wrapped.content, {
				deliverAs: delivery === "steer" ? "steer" : "followUp",
			});
			await wrapped.accepted;
		} catch (error) {
			this.settleBrowserInput(
				wrapped.nonce,
				error instanceof Error ? error : new Error(String(error)),
			);
			await wrapped.accepted.catch(() => undefined);
			throw error;
		}
		return { delivery };
	}

	private async preflightIdlePrompt(
		ctx: ExtensionContext,
		request: WebSendRequest,
		generation: number,
		signal: AbortSignal,
	): Promise<void> {
		if (request.delivery === "steer" || !ctx.isIdle() || ctx.hasPendingMessages()) return;
		await this.validateCurrentModel(ctx, generation, signal, false);
	}

	private async validateCurrentModel(
		ctx: ExtensionContext,
		generation: number,
		signal: AbortSignal,
		requireImages: boolean,
	): Promise<void> {
		const model = ctx.model;
		if (!model) throw new Error("No model is selected in Pi.");
		if (requireImages && !model.input.includes("image")) {
			throw new Error("The selected Pi model does not support images.");
		}
		if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
			const apiKey = await ctx.modelRegistry.getApiKeyForProvider(model.provider);
			if (!apiKey) throw new Error(`No authentication is available for "${model.provider}".`);
		}
		if (signal.aborted) throw new Error("The browser message was cancelled.");
		if (!this.context || this.closed || generation !== this.generation) {
			throw new Error("The Pi session changed while the message was being prepared.");
		}
		if (ctx.model !== model) throw new Error("The Pi model changed; retry the browser message.");
	}

	private createBrowserInput(
		content: string | Array<TextContent | ImageContent>,
		retainedImageIds: readonly string[],
	): {
		nonce: string;
		content: string | Array<TextContent | ImageContent>;
		accepted: Promise<void>;
	} {
		const nonce = randomUUID();
		const text = typeof content === "string" ? content : contentText(content);
		const envelope = `<pi-webui-input nonce="${nonce}">\n${INPUT_FOOTER}`;
		const wrappedContent =
			typeof content === "string"
				? envelope
				: [
						{ type: "text" as const, text: envelope },
						...content.filter((part): part is ImageContent => part.type === "image"),
					];
		const accepted = new Promise<void>((resolve, reject) => {
			this.pendingBrowserInputs.set(nonce, {
				resolve,
				reject,
				text,
				retainedImageIds: [...retainedImageIds],
			});
		});
		return { nonce, content: wrappedContent, accepted };
	}

	private settleBrowserInput(nonce: string, error?: Error): void {
		const pending = this.pendingBrowserInputs.get(nonce);
		if (!pending) return;
		this.pendingBrowserInputs.delete(nonce);
		if (error) pending.reject(error);
		else pending.resolve();
	}

	private cancelBrowserInputs(message: string): void {
		for (const nonce of [...this.pendingBrowserInputs.keys()]) {
			this.settleBrowserInput(nonce, new Error(message));
		}
	}

	private notifySettingsWarnings(ctx: ExtensionContext, warnings: string[]): void {
		const message = warnings.join("\n");
		if (!message || message === this.lastSettingsWarning) return;
		this.lastSettingsWarning = message;
		ctx.ui.notify(message, "warning");
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
				// Failed and generation-stale startups have no remaining live server.
			}
		}
	}
}

function parseBrowserInput(text: string): { nonce: string } | undefined {
	const header = INPUT_HEADER.exec(text);
	if (
		!header?.[1] ||
		!text.endsWith(INPUT_FOOTER) ||
		text.slice(header[0].length, -INPUT_FOOTER.length) !== ""
	) {
		return undefined;
	}
	return { nonce: header[1] };
}

function contentText(content: Array<TextContent | ImageContent>): string {
	return content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function sanitizeBrowserMessageEvent(
	event: unknown,
	acceptedNonces: Map<string, AcceptedBrowserInput>,
	consume: boolean,
): unknown {
	if (!isRecord(event) || !isRecord(event.message) || event.message.role !== "user") return event;
	const content = event.message.content;
	if (typeof content === "string") {
		const wrapped = parseBrowserInput(content);
		const accepted = wrapped ? acceptedNonces.get(wrapped.nonce) : undefined;
		if (!wrapped || !accepted) return event;
		if (consume) acceptedNonces.delete(wrapped.nonce);
		return {
			...event,
			retainedImageIds: [...accepted.retainedImageIds],
			message: { ...event.message, content: accepted.text },
		};
	}
	if (!Array.isArray(content)) return event;
	let accepted: AcceptedBrowserInput | undefined;
	let acceptedNonce: string | undefined;
	const sanitizedText = content.flatMap((part) => {
		if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") return [part];
		const wrapped = parseBrowserInput(part.text);
		const candidate = wrapped ? acceptedNonces.get(wrapped.nonce) : undefined;
		if (!wrapped || !candidate) return [part];
		accepted = candidate;
		acceptedNonce = wrapped.nonce;
		return candidate.text ? [{ ...part, text: candidate.text }] : [];
	});
	if (!accepted) return event;
	if (consume && acceptedNonce) acceptedNonces.delete(acceptedNonce);
	return {
		...event,
		retainedImageIds: [...accepted.retainedImageIds],
		message: { ...event.message, content: sanitizedText },
	};
}

function attachmentNotes(image: ProcessedBrowserImage): string[] {
	const notes: string[] = [];
	if (image.sourceFormat !== image.outputFormat) {
		notes.push(
			`Converted ${image.sourceFormat.toUpperCase()} to ${image.outputFormat.toUpperCase()}`,
		);
	}
	if (image.resized) {
		notes.push(
			`Resized ${image.originalWidth}×${image.originalHeight} to ${image.width}×${image.height}`,
		);
	}
	return notes;
}

function messageLifecycleKey(message: Record<string, unknown>): string {
	return `${message.role}:${typeof message.timestamp === "number" ? message.timestamp : "untimed"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatMib(bytes: number): string {
	return `${bytes / (1024 * 1024)} MiB`;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
