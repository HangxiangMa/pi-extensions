import { basename, sep } from "node:path";

const DEFAULT_TRUNCATION_LENGTH = 3;
const DEFAULT_HOME_SYMBOL = "~";

/** Apply Starship's default directory presentation without exposing a format language. */
export function formatDirectoryPath(
	cwd: string,
	homeDir: string | undefined,
	gitRoot: string | undefined,
): string {
	const source = toSlashPath(cwd);
	const home = homeDir ? toSlashPath(homeDir) : undefined;
	const root = gitRoot ? toSlashPath(gitRoot) : undefined;
	const contracted =
		root && root !== home && isWithin(source, root)
			? contractRepositoryPath(source, root)
			: contractPath(source, home, DEFAULT_HOME_SYMBOL);
	const components = contracted.split("/").filter((component) => component.length > 0);
	const displayed =
		components.length > DEFAULT_TRUNCATION_LENGTH
			? components.slice(-DEFAULT_TRUNCATION_LENGTH).join("/")
			: contracted;
	const native = sep === "/" ? displayed : displayed.replaceAll("/", sep);
	return native || basename(cwd) || cwd;
}

function toSlashPath(value: string): string {
	return value.replaceAll("\\", "/");
}

function contractPath(path: string, root: string | undefined, replacement: string): string {
	if (!root || !isWithin(path, root)) return path;
	if (path === root) return replacement;
	return `${replacement}/${path.slice(root.length).replace(/^\/+/, "")}`;
}

function contractRepositoryPath(path: string, root: string): string {
	const name = basename(root) || root;
	if (path === root) return name;
	return `${name}/${path.slice(root.length).replace(/^\/+/, "")}`;
}

function isWithin(path: string, root: string): boolean {
	const normalizedRoot = root.replace(/\/+$/u, "");
	return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`);
}
