/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type SubagentThinkingLevel = (typeof THINKING_LEVELS)[number];

export function isThinkingLevel(value: unknown): value is SubagentThinkingLevel {
	return typeof value === "string" && THINKING_LEVELS.includes(value as SubagentThinkingLevel);
}

export type AgentScope = "user" | "project" | "both";

export type AgentSource = "built-in" | "user" | "project";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	thinkingLevel?: SubagentThinkingLevel;
	timeoutMs?: number;
	systemPrompt: string;
	source: AgentSource;
	filePath: string;
}

export interface SubagentAgentConfig {
	tools?: string[];
	model?: string | null;
	thinkingLevel?: SubagentThinkingLevel | null;
	timeoutMs?: number | null;
}

export type SubagentTransportKind = "subprocess" | "in-process";

export type CompletionDelivery = "next-turn" | "auto-resume";

export interface SubagentBlockingSettings {
	enabled?: boolean;
}

export interface SubagentRuntimeSettings {
	enabled?: boolean;
	transport?: SubagentTransportKind;
	completionDelivery?: CompletionDelivery;
	maxAgents?: number;
	maxActiveTurns?: number;
	maxDepth?: number;
	maxChildrenPerAgent?: number;
	maxMailboxMessages?: number;
	maxMailboxMessageBytes?: number;
	idleTtlMs?: number;
	retentionDays?: number;
	maxStoredAgents?: number;
}

export interface SubagentSettings {
	agents?: Record<string, SubagentAgentConfig>;
	blocking?: SubagentBlockingSettings;
	stateful?: SubagentRuntimeSettings;
}

const BUILT_IN_AGENTS: AgentConfig[] = [
	{
		name: "scout",
		description:
			"Read-only codebase reconnaissance; returns concise findings with paths and evidence.",
		tools: ["read", "grep", "find", "ls", "bash"],
		source: "built-in",
		filePath: "built-in:scout",
		systemPrompt: [
			"You are a scout subagent. Explore the codebase quickly and report grounded findings.",
			"Do not edit files. Prefer read, grep, find, ls, and safe bash inspection commands.",
			"Return concise bullets with exact file paths, symbols, and open questions.",
		].join("\n"),
	},
	{
		name: "planner",
		description: "Turns reconnaissance into a lean implementation or migration plan.",
		tools: ["read", "grep", "find", "ls"],
		source: "built-in",
		filePath: "built-in:planner",
		systemPrompt: [
			"You are a planner subagent. Produce executable, verifiable plans only.",
			"Do not modify files. Ground the plan in the repository's actual structure.",
			"Call out assumptions, risks, sequencing, and verification commands.",
		].join("\n"),
	},
	{
		name: "reviewer",
		description: "Independent code review agent that inspects existing verification evidence.",
		tools: ["read", "grep", "find", "ls", "bash"],
		source: "built-in",
		filePath: "built-in:reviewer",
		systemPrompt: [
			"You are a reviewer subagent. Review changes adversarially and assess claims against the code and existing evidence.",
			"Do not edit files or run tests, builds, benchmarks, formatters, or other long-running verification commands.",
			"Inspect code, diffs, test definitions, and existing verification evidence. Recommend any additional commands for the main agent to run.",
			"Report PASS, FAIL, or PARTIAL with evidence, commands inspected, and specific follow-ups.",
		].join("\n"),
	},
	{
		name: "worker",
		description: "General-purpose implementation worker with the default Pi tool set.",
		source: "built-in",
		filePath: "built-in:worker",
		systemPrompt: workerSystemPrompt(),
	},
	{
		name: "general",
		description: "Alias for worker; kept for model-generated subagent names.",
		source: "built-in",
		filePath: "built-in:general",
		systemPrompt: workerSystemPrompt(),
	},
	{
		name: "general-purpose",
		description: "Alias for worker; compatible with common subagent naming conventions.",
		source: "built-in",
		filePath: "built-in:general-purpose",
		systemPrompt: workerSystemPrompt(),
	},
];

function workerSystemPrompt(): string {
	return [
		"You are a focused worker subagent running in an isolated Pi process.",
		"Complete the delegated task directly. Keep scope tight and avoid unrelated changes.",
		"When done, summarize files changed, commands run, and any remaining risks.",
	].join("\n");
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);

		if (!frontmatter.name || !frontmatter.description) {
			continue;
		}

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			thinkingLevel: isThinkingLevel(frontmatter.thinkingLevel)
				? frontmatter.thinkingLevel
				: undefined,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

function hasOwn(obj: object, key: PropertyKey): boolean {
	return Object.hasOwn(obj, key);
}

export function discoverAgents(
	cwd: string,
	scope: AgentScope,
	config?: SubagentSettings,
): AgentDiscoveryResult {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents =
		scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	const agentMap = new Map<string, AgentConfig>();

	// Lowest priority: built-ins are always available, then user agents, then
	// trusted project agents if requested. This mirrors the subagent boundary
	// pattern in ./src: stable built-ins plus overridable local definitions.
	for (const agent of BUILT_IN_AGENTS) agentMap.set(agent.name, agent);

	if (scope === "both") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	// Apply user-configured overrides (from /subagents → Agent tool settings) on top of
	// the final resolved agent map, regardless of agent source.
	for (const [name, override] of Object.entries(config?.agents ?? {})) {
		const agent = agentMap.get(name);
		if (!agent) continue;

		const nextAgent: AgentConfig = { ...agent };
		if (hasOwn(override, "tools")) nextAgent.tools = override.tools;
		if (hasOwn(override, "model")) {
			nextAgent.model = override.model === null ? undefined : override.model;
		}
		if (hasOwn(override, "thinkingLevel")) {
			nextAgent.thinkingLevel =
				override.thinkingLevel === null ? undefined : override.thinkingLevel;
		}
		if (hasOwn(override, "timeoutMs")) {
			nextAgent.timeoutMs = override.timeoutMs === null ? undefined : override.timeoutMs;
		}
		agentMap.set(name, nextAgent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentList(
	agents: AgentConfig[],
	maxItems: number,
): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}

export interface AgentCatalog {
	/** The effective catalog for the default invocation scope. */
	user: AgentDiscoveryResult;
	/** The project-scope catalog; custom project definitions are loaded only after project trust. */
	project?: AgentDiscoveryResult;
}

export interface AgentCatalogFormatOptions {
	maxItems?: number;
	maxDescriptionLength?: number;
	maxCharacters?: number;
}

export interface AgentCatalogFormatResult {
	text: string;
	omitted: number;
}

export const DEFAULT_AGENT_CATALOG_MAX_ITEMS = 32;
export const DEFAULT_AGENT_CATALOG_MAX_DESCRIPTION_LENGTH = 240;
export const DEFAULT_AGENT_CATALOG_MAX_CHARACTERS = 6_000;

const BUILT_IN_AGENT_ORDER = new Map(BUILT_IN_AGENTS.map((agent, index) => [agent.name, index]));

function compareCatalogAgents(left: AgentConfig, right: AgentConfig): number {
	const leftBuiltInOrder = BUILT_IN_AGENT_ORDER.get(left.name);
	const rightBuiltInOrder = BUILT_IN_AGENT_ORDER.get(right.name);
	if (leftBuiltInOrder !== undefined || rightBuiltInOrder !== undefined) {
		if (leftBuiltInOrder === undefined) return 1;
		if (rightBuiltInOrder === undefined) return -1;
		return leftBuiltInOrder - rightBuiltInOrder;
	}
	return left.name.localeCompare(right.name);
}

function normalizeCatalogDescription(description: string, maxLength: number): string {
	const normalized = description.replace(/\s+/gu, " ").trim();
	if (normalized.length <= maxLength) return normalized;
	const suffix = "…";
	return `${normalized.slice(0, Math.max(0, maxLength - suffix.length)).trimEnd()}${suffix}`;
}

type CatalogScope = "user" | "project" | "project-fallback";

function catalogAgentLine(
	agent: AgentConfig,
	scope: CatalogScope,
	userNames: ReadonlySet<string>,
	maxDescriptionLength: number,
): string {
	const scopeLabel =
		scope === "user"
			? 'agentScope: "user"'
			: scope === "project"
				? 'requires agentScope: "project" or "both"'
				: 'requires agentScope: "project" ("both" selects the user definition)';
	const collision =
		scope !== "user" && userNames.has(agent.name)
			? scope === "project"
				? "; overrides the default user definition for project/both"
				: "; scope-specific fallback for the default user override"
			: "";
	return `- ${agent.name} [source: ${agent.source}; ${scopeLabel}${collision}] — ${normalizeCatalogDescription(agent.description, maxDescriptionLength)}`;
}

/**
 * Format the effective agent variants that the parent model can invoke.
 *
 * User-authored descriptions are prompt text, so this formatter deliberately normalizes and bounds
 * them. Project definitions are supplied separately by the caller so an untrusted project is never
 * read merely to build model-facing metadata.
 */
export function formatAgentCatalog(
	catalog: AgentCatalog,
	options: AgentCatalogFormatOptions = {},
): AgentCatalogFormatResult {
	const maxItems = Math.max(0, options.maxItems ?? DEFAULT_AGENT_CATALOG_MAX_ITEMS);
	const maxDescriptionLength = Math.max(
		1,
		options.maxDescriptionLength ?? DEFAULT_AGENT_CATALOG_MAX_DESCRIPTION_LENGTH,
	);
	const maxCharacters = Math.max(1, options.maxCharacters ?? DEFAULT_AGENT_CATALOG_MAX_CHARACTERS);
	const userAgents = [...catalog.user.agents].sort(compareCatalogAgents);
	const projectScopeAgents = [...(catalog.project?.agents ?? [])].sort(compareCatalogAgents);
	const projectAgents = projectScopeAgents.filter((agent) => agent.source === "project");
	const userByName = new Map(userAgents.map((agent) => [agent.name, agent]));
	const userNames = new Set(userByName.keys());
	const projectFallbackAgents = projectScopeAgents.filter(
		(agent) => agent.source === "built-in" && userByName.get(agent.name)?.source === "user",
	);
	const allEntries = [
		...userAgents.map((agent) => ({ agent, scope: "user" as const })),
		...projectAgents.map((agent) => ({ agent, scope: "project" as const })),
		...projectFallbackAgents.map((agent) => ({ agent, scope: "project-fallback" as const })),
	];
	const boundedEntries = allEntries.slice(0, maxItems);

	const render = (entries: typeof allEntries, omitted: number): string => {
		const lines = [
			"Available agent definitions (metadata only; runtime validation and trust remain authoritative).",
		];
		const userLines = entries
			.filter((entry) => entry.scope === "user")
			.map((entry) => catalogAgentLine(entry.agent, entry.scope, userNames, maxDescriptionLength));
		if (userLines.length > 0) {
			lines.push('Default scope (agentScope: "user"):');
			lines.push(...userLines);
		}
		const projectLines = entries
			.filter((entry) => entry.scope !== "user")
			.map((entry) => catalogAgentLine(entry.agent, entry.scope, userNames, maxDescriptionLength));
		if (projectLines.length > 0) {
			lines.push("Trusted project/scope variants (use the required agentScope shown):");
			lines.push(...projectLines);
		}
		const collisionNames = entries
			.filter((entry) => entry.scope !== "user" && userNames.has(entry.agent.name))
			.map((entry) => entry.agent.name);
		if (collisionNames.length > 0 && projectLines.length > 0) {
			const precedence = entries
				.filter((entry) => entry.scope !== "user" && userNames.has(entry.agent.name))
				.map((entry) =>
					entry.scope === "project"
						? `${entry.agent.name}: user with "user", project with "project"/"both"`
						: `${entry.agent.name}: user with "user"/"both", built-in with "project"`,
				);
			lines.push(`Same-name precedence: ${precedence.join("; ")}.`);
		}
		if (omitted > 0) {
			lines.push(
				`[${omitted} additional agent definition${omitted === 1 ? "" : "s"} omitted due to metadata bounds.]`,
			);
		}
		return lines.join("\n");
	};

	let listedCount = boundedEntries.length;
	let text = render(boundedEntries.slice(0, listedCount), allEntries.length - listedCount);
	while (text.length > maxCharacters && listedCount > 0) {
		listedCount -= 1;
		text = render(boundedEntries.slice(0, listedCount), allEntries.length - listedCount);
	}
	return { text, omitted: allEntries.length - listedCount };
}

export function discoverAgentCatalog(
	cwd: string,
	projectTrusted: boolean,
	config?: SubagentSettings,
): AgentCatalog {
	return {
		user: discoverAgents(cwd, "user", config),
		project: projectTrusted
			? discoverAgents(cwd, "project", config)
			: { agents: BUILT_IN_AGENTS, projectAgentsDir: null },
	};
}
