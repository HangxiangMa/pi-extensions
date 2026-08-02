import { basename } from "node:path";
import {
	graphemes,
	toSlashPath,
	truncatePathComponents,
	useNativePathSeparator,
} from "./truncation.js";
import { defineModule, type ModuleOptionValue } from "./types.js";

export const directoryModule = defineModule({
	name: "directory",
	variables: ["symbol", "path", "full_path"],
	defaults: {
		format: "[ $symbol $path ]($style)",
		symbol: "📁",
		style: "cyan bold",
		disabled: false,
	},
	options: {
		truncation_length: { kind: "integer", default: 3, minimum: 0, maximum: 1_000_000 },
		truncate_to_repo: { kind: "boolean", default: true },
		fish_style_pwd_dir_length: { kind: "integer", default: 0, minimum: 0, maximum: 1_000 },
		truncation_symbol: { kind: "string", default: "" },
		home_symbol: { kind: "string", default: "~" },
		use_os_path_sep: { kind: "boolean", default: true },
		substitutions: { kind: "string-map", default: {} },
	},
	values: ({ runtime, options }) => {
		const fullPath = runtime.cwd;
		const source = toSlashPath(fullPath);
		const home = runtime.homeDir ? toSlashPath(runtime.homeDir) : undefined;
		const repoRoot = runtime.gitRoot ? toSlashPath(runtime.gitRoot) : undefined;
		const homeSymbol = stringOption(options, "home_symbol", "~");
		const truncateToRepo = booleanOption(options, "truncate_to_repo", true);
		const substitutions = mapOption(options, "substitutions");
		const homeContracted = contractPath(source, home, homeSymbol);
		const repoContracted =
			truncateToRepo && repoRoot && repoRoot !== home
				? contractRepositoryPath(source, repoRoot)
				: undefined;
		let path = repoContracted ?? homeContracted;
		let truncated = repoContracted !== undefined;

		for (const [from, to] of Object.entries(substitutions)) {
			if (from) path = path.replaceAll(from, to);
		}

		const componentResult = truncatePathComponents(
			path,
			numberOption(options, "truncation_length", 3),
		);
		path = componentResult.value;
		truncated ||= componentResult.truncated;

		if (truncated) {
			const fishLength = numberOption(options, "fish_style_pwd_dir_length", 0);
			if (fishLength > 0 && Object.keys(substitutions).length === 0) {
				path = `${fishPrefix(homeContracted, path, fishLength)}${path}`;
			} else {
				path = `${stringOption(options, "truncation_symbol", "")}${path}`;
			}
		}

		if (booleanOption(options, "use_os_path_sep", true)) path = useNativePathSeparator(path);
		return { path: path || basename(fullPath) || fullPath, full_path: fullPath };
	},
});

function contractPath(path: string, root: string | undefined, replacement: string): string {
	if (!root || !isWithin(path, root)) return path;
	if (path === root) return replacement;
	return `${replacement}/${path.slice(root.length).replace(/^\/+/, "")}`;
}

function contractRepositoryPath(path: string, root: string): string | undefined {
	if (!isWithin(path, root)) return undefined;
	const name = basename(root) || root;
	if (path === root) return name;
	return `${name}/${path.slice(root.length).replace(/^\/+/, "")}`;
}

function isWithin(path: string, root: string): boolean {
	const normalizedRoot = root.replace(/\/+$/u, "");
	return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`);
}

function fishPrefix(source: string, displayed: string, length: number): string {
	const prefix = source.endsWith(displayed) ? source.slice(0, -displayed.length) : "";
	if (!prefix) return "";
	return prefix
		.split("/")
		.map((component) => abbreviateComponent(component, length))
		.join("/");
}

function abbreviateComponent(component: string, length: number): string {
	if (!component) return "";
	const parts = graphemes(component);
	if (parts.length <= length) return component;
	return component.startsWith(".")
		? parts.slice(0, length + 1).join("")
		: parts.slice(0, length).join("");
}

function numberOption(
	options: Readonly<Record<string, ModuleOptionValue>>,
	name: string,
	fallback: number,
): number {
	const value = options[name];
	return typeof value === "number" ? value : fallback;
}

function stringOption(
	options: Readonly<Record<string, ModuleOptionValue>>,
	name: string,
	fallback: string,
): string {
	const value = options[name];
	return typeof value === "string" ? value : fallback;
}

function booleanOption(
	options: Readonly<Record<string, ModuleOptionValue>>,
	name: string,
	fallback: boolean,
): boolean {
	const value = options[name];
	return typeof value === "boolean" ? value : fallback;
}

function mapOption(
	options: Readonly<Record<string, ModuleOptionValue>>,
	name: string,
): Readonly<Record<string, string>> {
	const value = options[name];
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Readonly<Record<string, string>>)
		: {};
}
