import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWorktreeCommand } from "./command.js";
import {
	createWorktreeSettingsRuntime,
	settingsFilePath,
	type WorktreeSettingsRuntime,
} from "./settings.js";

interface WorktreeExtensionOptions {
	settings?: WorktreeSettingsRuntime;
}

export default function worktreeExtension(
	pi: ExtensionAPI,
	options: WorktreeExtensionOptions = {},
): void {
	const settings = options.settings ?? createWorktreeSettingsRuntime({ path: settingsFilePath });
	let sessionGeneration = 0;
	registerWorktreeCommand(pi, settings);

	pi.on("session_start", async (_event, ctx) => {
		const generation = ++sessionGeneration;
		const loaded = await settings.reload();
		if (generation !== sessionGeneration || !loaded.warning || !ctx.hasUI) return;
		ctx.ui.notify(loaded.warning, "warning");
	});
	pi.on("session_shutdown", async () => {
		sessionGeneration += 1;
		await settings.flush?.();
	});
}
