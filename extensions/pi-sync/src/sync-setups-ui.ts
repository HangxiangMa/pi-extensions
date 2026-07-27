import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, readLocalConfigObject } from "./config.js";
import { errorMessage, ownRecord, safeTerminalText } from "./manager-helpers.js";
import { syncIncludeSelection } from "./sync-policy.js";

const BACK = "Back";

export async function countValidSyncSetups(
	setups: Record<string, unknown> | undefined,
	signal?: AbortSignal,
) {
	let count = 0;
	for (const name of Object.keys(setups ?? {})) {
		throwIfAborted(signal);
		let valid = false;
		try {
			await loadConfig(name);
			valid = true;
		} catch {
			// Invalid setups stay visible in management but are not switchable.
		}
		throwIfAborted(signal);
		if (valid) count += 1;
	}
	return count;
}

function throwIfAborted(signal?: AbortSignal) {
	if (!signal?.aborted) return;
	throw signal.reason instanceof Error
		? signal.reason
		: new DOMException("The operation was aborted", "AbortError");
}

type SyncSetupActions = {
	add(signal?: AbortSignal): Promise<void>;
	edit(name: string, signal?: AbortSignal): Promise<void>;
	makeCurrent(name: string, signal?: AbortSignal): Promise<"exit" | undefined>;
	remove(name: string, signal?: AbortSignal): Promise<void>;
};

export async function showSyncSetups(
	ctx: ExtensionCommandContext,
	actions: SyncSetupActions,
	signal?: AbortSignal,
): Promise<"exit" | undefined> {
	while (!signal?.aborted) {
		const raw = await readLocalConfigObject();
		throwIfAborted(signal);
		const setups = ownRecord(raw?.syncSetups) ?? {};
		const active = typeof raw?.activeSyncSetup === "string" ? raw.activeSyncSetup : undefined;
		const labels = new Map<string, string>();
		for (const name of Object.keys(setups).sort((left, right) => left.localeCompare(right))) {
			const label = `${safeTerminalText(name)}${name === active ? " (current)" : ""}`;
			labels.set(label, name);
		}
		const selected = await ctx.ui.select(
			"Sync setups",
			["Add sync setup", ...labels.keys(), BACK],
			{ signal },
		);
		if (signal?.aborted || !selected || selected === BACK) return;
		if (selected === "Add sync setup") {
			try {
				await actions.add(signal);
			} catch (error) {
				if (signal?.aborted) return;
				ctx.ui.notify(
					`Sync setup was not added: ${menuErrorMessage(error)} Retry from Add sync setup.`,
					"error",
				);
			}
			continue;
		}
		const name = labels.get(selected);
		if (!name) continue;
		const result = await showSyncSetupDetail(ctx, name, actions, signal);
		if (result === "exit") return "exit";
	}
}

async function showSyncSetupDetail(
	ctx: ExtensionCommandContext,
	name: string,
	actions: SyncSetupActions,
	signal?: AbortSignal,
): Promise<"exit" | undefined> {
	while (!signal?.aborted) {
		const raw = await readLocalConfigObject();
		throwIfAborted(signal);
		const setups = ownRecord(raw?.syncSetups) ?? {};
		const setup = ownRecord(setups[name]);
		if (!setup) {
			ctx.ui.notify(`Sync setup “${safeTerminalText(name)}” no longer exists.`, "warning");
			return;
		}
		const active = typeof raw?.activeSyncSetup === "string" ? raw.activeSyncSetup : undefined;
		const setupCount = Object.keys(setups).length;
		const isCurrent = name === active;
		let detail: string[];
		let valid = true;
		try {
			const config = await loadConfig(name);
			throwIfAborted(signal);
			const selection = syncIncludeSelection(config.include);
			detail = [
				`Status: ${isCurrent ? "Current" : "Not current"}`,
				`Storage connection: ${safeTerminalText(config.connectionName)}`,
				`Endpoint: ${storageEndpoint(config)}`,
				`Storage location: ${storageLocation(config)}`,
				`Included content: ${selection.builtIns.length} built-in groups · ${selection.custom.length} extra paths`,
				`Sessions: ${selection.sessions ? "On — privacy-sensitive" : "Off"}`,
				`Automatic sync: ${config.automatic ? "On" : "Off"}`,
			];
		} catch (error) {
			valid = false;
			detail = [
				`Status: Invalid${isCurrent ? " current setup" : ""}`,
				`Reason: ${menuErrorMessage(error)}`,
				"Make current and sync are unavailable until this setup is repaired.",
			];
		}
		const removeUnavailable = isCurrent && setupCount > 1;
		if (removeUnavailable) detail.push("Remove unavailable: switch to another setup first.");
		const selected = await ctx.ui.select(
			[`Sync setup “${safeTerminalText(name)}”`, "", ...detail].join("\n"),
			[
				...(!isCurrent && valid ? ["Make current…"] : []),
				"Edit sync setup…",
				...(removeUnavailable ? [] : ["Remove sync setup…"]),
				BACK,
			],
			{ signal },
		);
		if (signal?.aborted || !selected || selected === BACK) return;
		try {
			if (selected === "Make current…") return actions.makeCurrent(name, signal);
			if (selected === "Edit sync setup…") await actions.edit(name, signal);
			else if (selected === "Remove sync setup…") {
				await actions.remove(name, signal);
				return;
			}
		} catch (error) {
			if (signal?.aborted) return;
			ctx.ui.notify(
				`Sync setup “${safeTerminalText(name)}” was not changed: ${menuErrorMessage(error)} Reopen it and retry.`,
				"error",
			);
		}
	}
}

function menuErrorMessage(error: unknown) {
	return safeTerminalText(errorMessage(error));
}

function storageEndpoint(config: Awaited<ReturnType<typeof loadConfig>>) {
	switch (config.backend.type) {
		case "s3":
			return safeTerminalText(config.backend.profile.endpoint);
		case "git":
			return safeTerminalText(config.backend.profile.remote);
		case "webdav":
			return safeTerminalText(config.backend.profile.url);
	}
}

function storageLocation(config: Awaited<ReturnType<typeof loadConfig>>) {
	switch (config.backend.type) {
		case "s3":
			return safeTerminalText(`${config.backend.destination.bucket}/${config.storagePath}`);
		case "git":
			return safeTerminalText(`Git · ${config.backend.destination.branch}:${config.storagePath}`);
		case "webdav":
			return safeTerminalText(`WebDAV · ${config.storagePath}`);
	}
}
