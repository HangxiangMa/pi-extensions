import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { MenuBrowseItem, MenuDefinition } from "@narumitw/pi-tui-kit";

export interface ToolCatalogState {
	tools: ReturnType<ExtensionAPI["getAllTools"]>;
	activeToolNames: readonly string[];
	toolSnippets: Readonly<Record<string, string>>;
}

export interface ToolCatalog {
	title: string;
	items: MenuBrowseItem[];
}

export function createToolCatalog(
	tools: ToolCatalogState["tools"],
	activeToolNames: readonly string[],
	toolSnippets: ToolCatalogState["toolSnippets"],
): ToolCatalog {
	const active = new Set(activeToolNames);
	const items = [...tools]
		.sort((left, right) => left.name.localeCompare(right.name))
		.map((tool): MenuBrowseItem => {
			const parameterSchema = JSON.stringify(tool.parameters, null, 2) ?? "Unavailable";
			const guidelines = tool.promptGuidelines ?? [];
			const effectivePromptSnippet = toolSnippets[tool.name];
			return {
				id: tool.name,
				label: tool.name,
				statusText: active.has(tool.name) ? "active" : "inactive",
				description: tool.description,
				searchText: [
					tool.name,
					tool.description,
					tool.sourceInfo.source,
					tool.sourceInfo.scope,
					tool.sourceInfo.origin,
					tool.sourceInfo.path,
					tool.sourceInfo.baseDir,
					effectivePromptSnippet,
					...guidelines,
					parameterSchema,
				]
					.filter(Boolean)
					.join(" "),
				details: [
					`Source: ${tool.sourceInfo.source}`,
					`Scope: ${tool.sourceInfo.scope}`,
					`Origin: ${tool.sourceInfo.origin}`,
					`Path: ${tool.sourceInfo.path}`,
					...(tool.sourceInfo.baseDir ? [`Base directory: ${tool.sourceInfo.baseDir}`] : []),
					"",
					"Effective prompt snippet",
					effectivePromptSnippet ?? "None in the current system prompt.",
					"",
					"Parameter schema",
					...parameterSchema.split("\n"),
					"",
					"Prompt guidelines",
					...(guidelines.length > 0 ? guidelines.map((guideline) => `• ${guideline}`) : ["None"]),
				],
			};
		});
	const activeCount = tools.reduce((count, tool) => count + Number(active.has(tool.name)), 0);
	return { title: `Tools · ${activeCount}/${tools.length} active`, items };
}

export function createToolMenu(): MenuDefinition<ToolCatalogState, "tools", never> {
	return {
		start: "tools",
		screens: {
			tools: ({ state }) => ({
				kind: "browse",
				...createToolCatalog(state.tools, state.activeToolNames, state.toolSnippets),
				viewportSize: "adaptive",
				hint: "close",
			}),
		},
		actions: {},
	};
}
