import type { AnySyncConfig, PartialConfig } from "./types.js";

const DEFAULT_GIT_BRANCH = "pi-sync";
const DEFAULT_GIT_DIRECTORY = "pi-sync";

export function resolveGitBackendConfig(
	partial: PartialConfig,
	common: Omit<AnySyncConfig, "backend">,
	settingsPath: string,
): AnySyncConfig {
	const namespace = common.profile;
	validateGitNamespace(namespace);
	const remote = normalizeGitRemote(partial.remote);
	const branch = normalizeGitBranch(partial.branch);
	const directory = normalizeGitDirectory(partial.directory);
	if (!remote) {
		throw new Error(`Missing pi-sync Git config: remote. Use /sync setup or edit ${settingsPath}.`);
	}
	return {
		...common,
		backend: {
			type: "git",
			profile: { kind: "git", remote },
			destination: { branch, directory, namespace },
		},
	};
}

export function resolveGitV2PartialConfig(
	profile: Record<string, unknown>,
	target: Record<string, unknown>,
	common: Pick<
		PartialConfig,
		"target" | "storageProfile" | "storageKind" | "settingsVersion" | "syncFiles" | "extraFiles"
	>,
	selectedTarget: string,
): PartialConfig {
	if (
		[
			"endpoint",
			"region",
			"accessKeyId",
			"secretAccessKey",
			"sessionToken",
			"url",
			"username",
			"password",
		].some((field) => Object.hasOwn(profile, field)) ||
		["bucket", "prefix", "path"].some((field) => Object.hasOwn(target, field))
	) {
		throw new Error("Invalid pi-sync settings: Git profile or target mixes backend fields.");
	}
	return {
		...common,
		remote: asOptionalString(profile.remote),
		branch: asOptionalString(target.branch),
		directory: asOptionalString(target.directory),
		profile: asOptionalString(target.namespace) ?? selectedTarget,
		autoSync: asOptionalBoolean(target.autoSync),
		syncSessions: asOptionalBoolean(target.syncSessions),
	};
}

export function gitRemoteDestinationIdentity(
	profile: Record<string, unknown> | undefined,
	target: Record<string, unknown>,
) {
	return JSON.stringify([
		"git",
		normalizeGitRemoteIdentity(
			typeof profile?.remote === "string" ? profile.remote : String(target.profile ?? ""),
		),
		normalizeGitBranch(typeof target.branch === "string" ? target.branch : undefined),
	]);
}

export function normalizeGitRemote(value: string | undefined) {
	const normalized = normalizeOptionalString(value);
	if (!normalized) return undefined;
	if (
		hasControlCharacter(normalized) ||
		/\s/u.test(normalized) ||
		normalized.startsWith("-") ||
		normalized.includes("\\")
	) {
		throw new Error("Invalid pi-sync Git remote.");
	}
	if (
		!normalized.includes("://") &&
		/^(?:[A-Za-z0-9._-]+@)?(?:\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+):(?!-)[^:].+$/u.test(normalized)
	) {
		return normalized;
	}
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(normalized) && !normalized.includes("://")) {
		throw new Error("Invalid pi-sync Git remote: unsupported transport or remote-helper syntax.");
	}
	let url: URL;
	try {
		url = new URL(normalized);
	} catch {
		throw new Error("Invalid pi-sync Git remote: use an SSH or HTTPS remote.");
	}
	if (url.protocol !== "https:" && url.protocol !== "ssh:") {
		throw new Error("Invalid pi-sync Git remote: only SSH and HTTPS are supported.");
	}
	if (url.password || (url.protocol === "https:" && url.username)) {
		throw new Error("Invalid pi-sync Git remote: URL credentials or userinfo are not allowed.");
	}
	if (url.search || url.hash || !url.hostname || !url.pathname || url.pathname === "/") {
		throw new Error("Invalid pi-sync Git remote.");
	}
	return url.toString();
}

export function normalizeGitRemoteIdentity(value: string) {
	const normalized = normalizeGitRemote(value);
	if (!normalized) return "";
	if (!normalized.includes("://")) {
		const match =
			/^(?<user>[A-Za-z0-9._-]+@)?(?<host>\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+):(?<path>.+)$/u.exec(
				normalized,
			);
		if (!match?.groups) return normalized;
		const userAndHost = `${match.groups.user ?? ""}${match.groups.host.toLowerCase()}`;
		const remotePath = match.groups.path.replace(/\/+$/gu, "");
		return remotePath.startsWith("/")
			? `scp-absolute://${userAndHost}${remotePath}`
			: `ssh://${userAndHost}/${remotePath}`;
	}
	const url = new URL(normalized);
	url.hostname = url.hostname.toLowerCase();
	if (url.protocol === "ssh:" && url.port === "22") url.port = "";
	url.pathname = url.pathname.replace(/\/+$/gu, "");
	if (url.protocol === "ssh:") {
		return `ssh://${url.username ? `${url.username}@` : ""}${url.host}${url.pathname}`;
	}
	return url.toString();
}

export function normalizeGitBranch(value: string | undefined) {
	const branch = normalizeOptionalString(value) ?? DEFAULT_GIT_BRANCH;
	if (
		branch === "@" ||
		branch.startsWith("-") ||
		branch.startsWith("refs/") ||
		branch.startsWith("/") ||
		branch.endsWith("/") ||
		branch.endsWith(".") ||
		branch.includes("..") ||
		branch.includes("@{") ||
		branch.includes("\\") ||
		hasControlCharacter(branch) ||
		/[ ~^:?*[\]]/u.test(branch) ||
		branch
			.split("/")
			.some((segment) => !segment || segment.startsWith(".") || segment.endsWith(".lock"))
	) {
		throw new Error("Invalid pi-sync Git branch.");
	}
	return branch;
}

export function normalizeGitDirectory(value: string | undefined) {
	const directory = trimSlashes(normalizeOptionalString(value) ?? DEFAULT_GIT_DIRECTORY);
	if (
		!directory ||
		directory.startsWith("-") ||
		directory.includes("\\") ||
		hasControlCharacter(directory) ||
		directory
			.split("/")
			.some((segment) => !segment || segment === "." || segment === ".." || segment === ".git")
	) {
		throw new Error("Invalid pi-sync Git directory.");
	}
	return directory;
}

export function validateGitNamespace(value: string) {
	if (
		value.length > 256 ||
		value === "." ||
		value === ".." ||
		value.includes("/") ||
		value.includes("\\") ||
		hasControlCharacter(value)
	) {
		throw new Error("Invalid pi-sync Git namespace.");
	}
}

function normalizeOptionalString(value: unknown) {
	if (value !== undefined && typeof value !== "string") {
		throw new Error("Invalid pi-sync settings: expected a string.");
	}
	const normalized = value?.trim();
	return normalized || undefined;
}

function asOptionalString(value: unknown) {
	return normalizeOptionalString(value);
}

function asOptionalBoolean(value: unknown) {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") throw new Error("Invalid pi-sync settings: expected a boolean.");
	return value;
}

function trimSlashes(value: string) {
	return value.replace(/^\/+|\/+$/gu, "");
}

function hasControlCharacter(value: string) {
	return [...value].some((character) => {
		const code = character.codePointAt(0) ?? 0;
		return code < 0x20 || (code >= 0x7f && code <= 0x9f);
	});
}
