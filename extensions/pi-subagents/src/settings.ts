import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	type AgentConfig,
	isThinkingLevel,
	type SubagentAgentConfig,
	type SubagentSettings,
	type SubagentThinkingLevel,
} from "./agents.js";

export function hasOwn(obj: object, key: PropertyKey): boolean {
	return Object.hasOwn(obj, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPositiveNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 1;
}

function isPositiveInteger(value: unknown): value is number {
	return isPositiveNumber(value) && Number.isSafeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function normalizeAgentSettings(value: unknown): SubagentAgentConfig | undefined {
	if (!isPlainObject(value)) return undefined;

	const config: SubagentAgentConfig = {};
	let hasKnownField = false;

	if (hasOwn(value, "tools")) {
		if (!isStringArray(value.tools)) return undefined;
		config.tools = value.tools;
		hasKnownField = true;
	}

	if (hasOwn(value, "model")) {
		if (value.model !== null && typeof value.model !== "string") return undefined;
		config.model = value.model;
		hasKnownField = true;
	}

	if (hasOwn(value, "thinkingLevel")) {
		if (value.thinkingLevel !== null && !isThinkingLevel(value.thinkingLevel)) return undefined;
		config.thinkingLevel = value.thinkingLevel;
		hasKnownField = true;
	}

	if (hasOwn(value, "timeoutMs")) {
		if (value.timeoutMs !== null && !isPositiveNumber(value.timeoutMs)) return undefined;
		config.timeoutMs = value.timeoutMs;
		hasKnownField = true;
	}

	return hasKnownField ? config : undefined;
}

export function normalizeSubagentSettings(value: unknown): SubagentSettings | undefined {
	if (!isPlainObject(value)) return undefined;
	const settings: SubagentSettings = {};
	if (hasOwn(value, "agents")) {
		if (!isPlainObject(value.agents)) return undefined;
		const agents: Record<string, SubagentAgentConfig> = {};
		for (const [name, rawConfig] of Object.entries(value.agents)) {
			const config = normalizeAgentSettings(rawConfig);
			if (config) agents[name] = config;
		}
		if (Object.keys(agents).length > 0) settings.agents = agents;
	}
	if (hasOwn(value, "stateful")) {
		if (!isPlainObject(value.stateful)) return undefined;
		const runtime: NonNullable<SubagentSettings["stateful"]> = {};
		if (hasOwn(value.stateful, "transport")) {
			if (value.stateful.transport !== "subprocess" && value.stateful.transport !== "in-process") {
				return undefined;
			}
			runtime.transport = value.stateful.transport;
		}
		for (const key of [
			"maxAgents",
			"maxActiveTurns",
			"maxChildrenPerAgent",
			"maxMailboxMessages",
			"maxMailboxMessageBytes",
			"idleTtlMs",
			"maxStoredAgents",
		] as const) {
			if (hasOwn(value.stateful, key)) {
				if (!isPositiveInteger(value.stateful[key])) return undefined;
				runtime[key] = value.stateful[key];
			}
		}
		if (hasOwn(value.stateful, "maxDepth")) {
			if (!isNonNegativeInteger(value.stateful.maxDepth)) return undefined;
			runtime.maxDepth = value.stateful.maxDepth;
		}
		if (hasOwn(value.stateful, "retentionDays")) {
			if (!isPositiveNumber(value.stateful.retentionDays)) return undefined;
			runtime.retentionDays = value.stateful.retentionDays;
		}
		if (hasOwn(value.stateful, "enabled")) {
			if (typeof value.stateful.enabled !== "boolean") return undefined;
			runtime.enabled = value.stateful.enabled;
		}
		settings.stateful = runtime;
	}
	return settings;
}

const SETTINGS_FILE = "pi-subagents.json";
const LEGACY_SETTINGS_FILE = "pi-subagents-config.json";
let pendingSettingsNotice: string | undefined;

export function readSubagentSettings(): SubagentSettings | undefined {
	const canonicalPath = path.join(getAgentDir(), SETTINGS_FILE);
	const legacyPath = path.join(getAgentDir(), LEGACY_SETTINGS_FILE);
	if (fs.existsSync(canonicalPath)) {
		const canonical = readSettingsFile(canonicalPath);
		const notices: string[] = [];
		if (!canonical) notices.push(`${SETTINGS_FILE} is invalid and was ignored.`);
		if (fs.existsSync(legacyPath)) {
			notices.push(`${LEGACY_SETTINGS_FILE} ignored because ${SETTINGS_FILE} takes precedence.`);
		}
		if (notices.length > 0) pendingSettingsNotice = notices.join("\n");
		return canonical;
	}
	if (!fs.existsSync(legacyPath)) return undefined;
	const legacy = readSettingsFile(legacyPath);
	if (!legacy) {
		pendingSettingsNotice = `${LEGACY_SETTINGS_FILE} is invalid and was ignored.`;
		return undefined;
	}
	try {
		installFileExclusively(canonicalPath, `${JSON.stringify(legacy, null, "\t")}\n`);
	} catch (error) {
		if (fs.existsSync(canonicalPath)) return readSettingsFile(canonicalPath);
		pendingSettingsNotice = `Subagent settings migration failed: ${formatError(error)}. The legacy file was used for this session.`;
		return legacy;
	}
	try {
		fs.rmSync(legacyPath);
		pendingSettingsNotice = `Subagent settings migrated from ${LEGACY_SETTINGS_FILE} to ${SETTINGS_FILE}.`;
	} catch (error) {
		pendingSettingsNotice = `Subagent settings migrated to ${SETTINGS_FILE}, but ${LEGACY_SETTINGS_FILE} could not be removed: ${formatError(error)}.`;
	}
	return legacy;
}

function installFileExclusively(filePath: string, contents: string) {
	const tempFile = path.join(path.dirname(filePath), `.${SETTINGS_FILE}.${randomUUID()}.tmp`);
	try {
		fs.writeFileSync(tempFile, contents, { encoding: "utf8", flag: "wx" });
		fs.linkSync(tempFile, filePath);
	} finally {
		fs.rmSync(tempFile, { force: true });
	}
}

export function consumeSubagentSettingsNotice() {
	const notice = pendingSettingsNotice;
	pendingSettingsNotice = undefined;
	return notice;
}

export function saveSubagentConfig(settings: SubagentSettings): void {
	const agentDir = getAgentDir();
	fs.mkdirSync(agentDir, { recursive: true });
	const configPath = path.join(agentDir, SETTINGS_FILE);
	fs.writeFileSync(configPath, `${JSON.stringify(settings, null, "\t")}\n`, "utf-8");
}

function readSettingsFile(configPath: string): SubagentSettings | undefined {
	try {
		return normalizeSubagentSettings(JSON.parse(fs.readFileSync(configPath, "utf-8")));
	} catch {
		return undefined;
	}
}

function formatError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export function uniqueToolNames(tools: string[]): string[] {
	return [...new Set(tools)];
}

export function sameToolSet(left: string[], right: string[]): boolean {
	const leftSet = new Set(left);
	const rightSet = new Set(right);
	if (leftSet.size !== rightSet.size) return false;
	return [...leftSet].every((tool) => rightSet.has(tool));
}

export function resolveSubagentThinkingLevel(
	agents: readonly Pick<AgentConfig, "name" | "thinkingLevel">[],
	agentName: string,
	topLevelThinkingLevel?: SubagentThinkingLevel,
	localThinkingLevel?: SubagentThinkingLevel,
): SubagentThinkingLevel | undefined {
	return (
		localThinkingLevel ??
		topLevelThinkingLevel ??
		agents.find((agent) => agent.name === agentName)?.thinkingLevel
	);
}

export function hasAnyAgentOverride(config: SubagentAgentConfig): boolean {
	return (
		hasOwn(config, "tools") ||
		hasOwn(config, "model") ||
		hasOwn(config, "thinkingLevel") ||
		hasOwn(config, "timeoutMs")
	);
}
