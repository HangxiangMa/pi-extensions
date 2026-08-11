import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { FIRECRAWL_TOOL_NAMES, type FirecrawlToolName } from "./tool-names.js";

export const FIRECRAWL_LOAD_TOOL_NAME = "firecrawl_load";

const AVAILABLE_TOOLS_STORE = Symbol.for("@narumitw/pi-firecrawl.available-tools-store");
type FirecrawlGlobal = typeof globalThis & {
	[AVAILABLE_TOOLS_STORE]?: WeakMap<ExtensionAPI, Set<FirecrawlToolName>>;
};
const sharedGlobal = globalThis as FirecrawlGlobal;
const existingAvailableToolsStore = sharedGlobal[AVAILABLE_TOOLS_STORE];
const availableToolsByApi =
	existingAvailableToolsStore ?? new WeakMap<ExtensionAPI, Set<FirecrawlToolName>>();
if (!existingAvailableToolsStore) sharedGlobal[AVAILABLE_TOOLS_STORE] = availableToolsByApi;

const SEARCH_TEXT: Record<FirecrawlToolName, string> = {
	firecrawl_scrape:
		"scrape scraping extract extraction single url page pages markdown html raw links screenshot json structured content",
	firecrawl_crawl: "crawl crawling website site start pages depth paths sitemap batch",
	firecrawl_crawl_status:
		"crawl crawling status job monitor check retrieve completed progress results",
	firecrawl_map: "map mapping discover discovery url urls links sitemap site inventory",
	firecrawl_search:
		"search searching web internet query results research discover discovery optionally scrape",
};

export function initializeAvailableFirecrawlTools(pi: ExtensionAPI) {
	if (availableToolsByApi.has(pi)) return;
	const activeTools = new Set(pi.getActiveTools());
	setAvailableTools(
		pi,
		FIRECRAWL_TOOL_NAMES.filter((name) => activeTools.has(name)),
	);
}

export function configureLazyFirecrawlTools(
	pi: ExtensionAPI,
	availableTools: readonly FirecrawlToolName[],
) {
	setAvailableTools(pi, availableTools);
	const nonCapabilityTools = pi
		.getActiveTools()
		.filter((name) => !FIRECRAWL_TOOL_NAMES.includes(name as FirecrawlToolName));
	pi.setActiveTools(unique([...nonCapabilityTools, FIRECRAWL_LOAD_TOOL_NAME]));
}

export function applyAvailableFirecrawlTools(
	pi: ExtensionAPI,
	availableTools: readonly FirecrawlToolName[],
) {
	const available = setAvailableTools(pi, availableTools);
	const active = pi
		.getActiveTools()
		.filter(
			(name) =>
				!FIRECRAWL_TOOL_NAMES.includes(name as FirecrawlToolName) ||
				available.has(name as FirecrawlToolName),
		);
	pi.setActiveTools(unique([...active, FIRECRAWL_LOAD_TOOL_NAME]));
}

export function availableFirecrawlTools(pi: ExtensionAPI) {
	const available = availableToolsByApi.get(pi) ?? new Set();
	return FIRECRAWL_TOOL_NAMES.filter((name) => available.has(name));
}

export function createFirecrawlLoadTool(pi: ExtensionAPI) {
	return defineTool({
		name: FIRECRAWL_LOAD_TOOL_NAME,
		label: "Firecrawl: Load Tools",
		description:
			"Find and enable Firecrawl tools relevant to a web scraping, crawling, URL discovery, crawl-status, or search task. Loaded tools remain available for the session.",
		promptSnippet: "Load Firecrawl web research capabilities on demand",
		promptGuidelines: [
			"Use firecrawl_load when a task requires Firecrawl web scraping, crawling, URL discovery, crawl status, or search and the needed firecrawl_* capability is not active.",
			"If FIRECRAWL_API_KEY is missing, report the configuration error instead of retrying repeatedly.",
		],
		parameters: Type.Object({
			query: Type.String({
				description: "Firecrawl capability or web research task to find tools for.",
				maxLength: 500,
			}),
			limit: Type.Optional(
				Type.Integer({
					description: "Maximum tools to load. Defaults to 3.",
					minimum: 1,
					maximum: 5,
				}),
			),
		}),
		async execute(_toolCallId, params, signal) {
			signal?.throwIfAborted();
			const available = new Set(availableFirecrawlTools(pi));
			const matches = matchFirecrawlTools(params.query, params.limit ?? 3, available);
			const active = pi.getActiveTools();
			const activeSet = new Set(active);
			const added = matches.filter((name) => !activeSet.has(name));
			if (added.length > 0) pi.setActiveTools(unique([...active, ...added]));

			const text =
				matches.length === 0
					? "No available Firecrawl tools matched the query."
					: added.length > 0
						? `Loaded Firecrawl tools: ${added.join(", ")}`
						: `Matching Firecrawl tools are already loaded: ${matches.join(", ")}`;
			return {
				content: [{ type: "text" as const, text }],
				details: { matches, added },
			};
		},
	});
}

function matchFirecrawlTools(
	query: string,
	limit: number,
	available: ReadonlySet<FirecrawlToolName>,
) {
	const terms = query
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((term) => term.length >= 2);
	if (terms.length === 0) return [];
	const ranked = FIRECRAWL_TOOL_NAMES.filter((name) => available.has(name))
		.map((name, index) => ({
			name,
			index,
			score: terms.reduce(
				(score, term) => score + (SEARCH_TEXT[name].split(" ").includes(term) ? 1 : 0),
				0,
			),
		}))
		.filter((match) => match.score > 0)
		.sort((left, right) => right.score - left.score || left.index - right.index);
	const bestScore = ranked[0]?.score;
	if (bestScore === undefined) return [];
	const matches = ranked
		.filter((match) => match.score === bestScore)
		.slice(0, limit)
		.map((match) => match.name);
	if (
		matches.includes("firecrawl_crawl") &&
		available.has("firecrawl_crawl_status") &&
		!matches.includes("firecrawl_crawl_status") &&
		matches.length < limit
	) {
		matches.push("firecrawl_crawl_status");
	}
	return matches;
}

function setAvailableTools(pi: ExtensionAPI, availableTools: readonly FirecrawlToolName[]) {
	const available = new Set(availableTools);
	availableToolsByApi.set(pi, available);
	return available;
}

function unique(values: readonly string[]) {
	return [...new Set(values)];
}
