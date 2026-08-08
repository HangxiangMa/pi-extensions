import { BRACKETED_PRESET } from "./bracketed.js";
import { MINIMAL_PRESET } from "./minimal.js";
import { NERD_FONT_SYMBOLS_PRESET } from "./nerd-font-symbols.js";
import { TOKYO_NIGHT_PRESET } from "./tokyo-night.js";

export interface StarshipPreset {
	id: "minimal" | "bracketed" | "nerd-font-symbols" | "tokyo-night";
	label: string;
	description: string;
	requiresNerdFont: boolean;
	rawDocument: string;
}

export const STARSHIP_PRESETS = [
	{
		id: "minimal",
		label: "Minimal",
		description: "Model, directory, branch, and activity · font-safe",
		requiresNerdFont: false,
		rawDocument: MINIMAL_PRESET,
	},
	{
		id: "bracketed",
		label: "Bracketed",
		description: "Balanced Pi and Git details in brackets · font-safe",
		requiresNerdFont: false,
		rawDocument: BRACKETED_PRESET,
	},
	{
		id: "nerd-font-symbols",
		label: "Nerd Font Symbols",
		description: "Balanced default layout with icon-rich symbols · requires Nerd Font",
		requiresNerdFont: true,
		rawDocument: NERD_FONT_SYMBOLS_PRESET,
	},
	{
		id: "tokyo-night",
		label: "Tokyo Night",
		description: "Palette-backed Powerline segments · requires Nerd Font",
		requiresNerdFont: true,
		rawDocument: TOKYO_NIGHT_PRESET,
	},
] as const satisfies readonly StarshipPreset[];

export function getStarshipPreset(id: StarshipPreset["id"]): StarshipPreset {
	const preset = STARSHIP_PRESETS.find((candidate) => candidate.id === id);
	if (!preset) throw new Error(`Unknown pi-starship preset: ${id}`);
	return preset;
}

export function presetForDocument(rawDocument: string | undefined): StarshipPreset | undefined {
	return STARSHIP_PRESETS.find((preset) => preset.rawDocument === rawDocument);
}
