import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { BUILT_IN_CONFIG } from "../src/config.js";
import { parseFormat } from "../src/format/formatter.js";
import {
	buildExtensionStatusIconAliases,
	formatCount,
	formatExtensionStatus,
	renderStatusline,
	type StarshipRuntimeSnapshot,
	shortenModel,
} from "../src/modules/index.js";

const LINK = "\x1b]8;;https://github.com/o/r/pull/123\x07#123\x1b]8;;\x07";

function stripAnsi(value: string): string {
	const escapeSequence = String.fromCharCode(27);
	let result = value.replace(new RegExp(`${escapeSequence}\\[[0-9;]*m`, "gu"), "");
	const osc8Prefix = `${escapeSequence}]8;;`;
	const terminator = String.fromCharCode(7);
	while (true) {
		const start = result.indexOf(osc8Prefix);
		if (start === -1) return result;
		const end = result.indexOf(terminator, start + osc8Prefix.length);
		if (end === -1) return result.slice(0, start);
		result = result.slice(0, start) + result.slice(end + terminator.length);
	}
}

function fixture(overrides: Partial<StarshipRuntimeSnapshot> = {}): StarshipRuntimeSnapshot {
	return {
		cwd: "/work/pi-extensions",
		model: { provider: "anthropic", id: "claude-sonnet-4-20250514" },
		thinkingLevel: "high",
		turnCount: 7,
		activeTools: new Map(),
		isStreaming: false,
		lastCompletedTool: "read",
		contextUsage: { percent: 75, tokens: 750, contextWindow: 1000 },
		tokenTotals: {
			input: 1530,
			output: 200,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0.1234,
		},
		usingSubscription: false,
		gitBranch: "feature",
		gitBranchDetails: { name: "feature", detached: false },
		gitCommit: { hash: "0123456789abcdef", detached: false },
		githubPr: {
			number: "123",
			link: LINK,
			state: "open",
			checks: "2 failing",
			review: "approved",
			status: "2 failing",
		},
		gitStatus: {
			ahead: 2,
			behind: 1,
			stashed: 0,
			conflicted: 1,
			deleted: 0,
			renamed: 0,
			modified: 4,
			staged: 3,
			typechanged: 0,
			untracked: 5,
			worktreeAdded: 0,
			worktreeDeleted: 0,
			worktreeModified: 4,
			worktreeTypechanged: 0,
			indexAdded: 3,
			indexDeleted: 0,
			indexModified: 0,
			indexTypechanged: 0,
		},
		extensionStatuses: new Map([["goal", "active"]]),
		extensionStatusIconAliases: new Map(),
		now: new Date(2026, 0, 1, 9, 5),
		...overrides,
	};
}

test("built-in modules expose Pi values through the default format", () => {
	const rendered = renderStatusline(BUILT_IN_CONFIG, fixture());
	const plain = stripAnsi(rendered.ansi);
	assert.match(plain, /π/);
	assert.match(plain, /anthropic/);
	assert.match(plain, /sonnet-4/);
	assert.match(plain, /high/);
	assert.match(plain, /pi-extensions/);
	assert.match(plain, /feature/);
	assert.match(plain, /PR #123 · 2 failing/);
	assert.match(plain, /=1 !4 \+3 \?5 ⇕⇡2⇣1/);
	assert.match(plain, /read/);
	assert.match(plain, /75\.0%/);
	assert.match(plain, /↑1\.5k ↓200/);
	assert.match(plain, /\$0\.123/);
	assert.match(plain, /09:05/);
	assert.match(plain, /🎯 active/);
});

test("context supports native percentage/window precision", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$context";
	config.formatAst = parseFormat(config.format);
	config.modules.context.format = "$percentage/$window";
	config.modules.context.formatAst = parseFormat(config.modules.context.format);

	assert.equal(
		stripAnsi(
			renderStatusline(
				config,
				fixture({
					contextUsage: { percent: 2.4, tokens: 6528, contextWindow: 272_000 },
				}),
			).ansi,
		),
		"2.4%/272k",
	);
});

test("cache and subscription modules expose native usage semantics", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$cache|$cost";
	config.formatAst = parseFormat(config.format);
	config.modules.cache.disabled = false;
	const runtime = fixture({
		tokenTotals: {
			input: 100,
			output: 20,
			cacheRead: 2300,
			cacheWrite: 1500,
			cost: 0.1234,
			latestCacheHitRate: 87.5,
		},
		usingSubscription: true,
	});

	assert.match(
		stripAnsi(renderStatusline(config, runtime).ansi),
		/📦 CH87\.5% \| 💸 \$0\.123 \(sub\) /u,
	);

	config.modules.cache.format = "$read/$write/$rate";
	config.modules.cache.formatAst = parseFormat(config.modules.cache.format);
	assert.match(stripAnsi(renderStatusline(config, runtime).ansi), /^2\.3k\/1\.5k\/87\.5%\|/u);

	config.modules.cache.format = "[$symbol:$rate]($style)";
	config.modules.cache.formatAst = parseFormat(config.modules.cache.format);
	config.modules.cache.symbol = "C";
	config.modules.cache.style = "red";
	assert.ok(
		renderStatusline(config, runtime).ansi.includes(`${String.fromCharCode(27)}[31mC:87.5%`),
	);

	assert.equal(
		renderStatusline(
			config,
			fixture({
				tokenTotals: {
					input: 100,
					output: 20,
					cacheRead: 0,
					cacheWrite: 0,
					cost: 0,
					latestCacheHitRate: 0,
				},
				usingSubscription: false,
			}),
		).modules.cache.length,
		0,
	);

	config.format = "$cost";
	config.formatAst = parseFormat(config.format);
	assert.match(
		stripAnsi(
			renderStatusline(
				config,
				fixture({
					tokenTotals: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						cost: 0,
					},
					usingSubscription: true,
				}),
			).ansi,
		),
		/\$0\.000 \(sub\)/u,
	);
});

test("cache read and write remain available when the latest rate is unknown", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$cache";
	config.formatAst = parseFormat(config.format);
	config.modules.cache.disabled = false;
	config.modules.cache.format = "$symbol:$read/$write/$rate";
	config.modules.cache.formatAst = parseFormat(config.modules.cache.format);
	config.modules.cache.symbol = "C";

	const runtime = fixture({
		tokenTotals: {
			input: 100,
			output: 20,
			cacheRead: 2300,
			cacheWrite: 1500,
			cost: 0.1,
			latestCacheHitRate: undefined,
		},
	});
	assert.equal(stripAnsi(renderStatusline(config, runtime).ansi), "C:2.3k/1.5k/");

	config.modules.cache.format = BUILT_IN_CONFIG.modules.cache.format;
	config.modules.cache.formatAst = parseFormat(config.modules.cache.format);
	assert.equal(stripAnsi(renderStatusline(config, runtime).ansi).trim(), "C");
});

test("external github-pr statuses remain generic extension statuses", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$extension_status";
	config.formatAst = [{ type: "variable", name: "extension_status" }];
	const rendered = stripAnsi(
		renderStatusline(
			config,
			fixture({
				githubPr: undefined,
				extensionStatuses: new Map([["github-pr", `PR ${LINK}: checks failing (2), approved`]]),
			}),
		).ansi,
	);
	assert.match(rendered, /🔌 PR/u);
	assert.match(rendered, /checks failing/u);
	assert.doesNotMatch(rendered, /🔎/u);
});

test("empty and disabled modules disappear and make conditionals empty", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "($provider)($git_branch)($git_status)($extension_status)";
	config.formatAst = [
		{ type: "conditional", children: [{ type: "variable", name: "provider" }] },
		{ type: "conditional", children: [{ type: "variable", name: "git_branch" }] },
		{ type: "conditional", children: [{ type: "variable", name: "git_status" }] },
		{ type: "conditional", children: [{ type: "variable", name: "extension_status" }] },
	];
	const rendered = renderStatusline(
		config,
		fixture({
			model: undefined,
			gitBranch: null,
			gitBranchDetails: undefined,
			gitStatus: undefined,
			extensionStatuses: new Map(),
		}),
	);
	assert.equal(rendered.ansi, "");

	config.format = "$model$time";
	config.formatAst = [
		{ type: "variable", name: "model" },
		{ type: "variable", name: "time" },
	];
	config.modules.time.disabled = true;
	const onlyModel = renderStatusline(config, fixture());
	assert.equal(
		stripAnsi(onlyModel.ansi),
		onlyModel.modules.model.map((chunk) => chunk.text).join(""),
	);
});

test("module format, symbol, style, and disabled settings apply", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$model";
	config.formatAst = [{ type: "variable", name: "model" }];
	config.modules.model.format = "[$symbol:$model]($style)";
	config.modules.model.formatAst = [
		{
			type: "group",
			children: [
				{ type: "variable", name: "symbol" },
				{ type: "text", value: ":" },
				{ type: "variable", name: "model" },
			],
			style: [{ type: "variable", name: "style" }],
		},
	];
	config.modules.model.symbol = "M";
	config.modules.model.style = "red bold";
	const rendered = renderStatusline(config, fixture()).ansi;
	assert.ok(rendered.includes("\u001b[31;1mM:sonnet-4"));
	config.modules.model.disabled = true;
	assert.equal(renderStatusline(config, fixture()).ansi, "");
});

test("model truncation keeps the configured portions after built-in shortening", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$model";
	config.formatAst = [{ type: "variable", name: "model" }];
	config.modules.model.format = "$model";
	config.modules.model.formatAst = [{ type: "variable", name: "model" }];
	config.modules.model.options.truncation_length = 6;

	const renderModel = (id: string) =>
		stripAnsi(renderStatusline(config, fixture({ model: { provider: "llama.cpp", id } })).ansi);

	config.modules.model.options.truncation_direction = "end";
	assert.equal(renderModel("abcdefghijklmno"), "abcdef…");
	config.modules.model.options.truncation_direction = "start";
	assert.equal(renderModel("abcdefghijklmno"), "…jklmno");
	config.modules.model.options.truncation_direction = "middle";
	assert.equal(renderModel("abcdefghijklmno"), "abc…mno");
	config.modules.model.options.truncation_length = 5;
	assert.equal(renderModel("abcdefghijklmno"), "abc…no");

	config.modules.model.options.truncation_length = 6;
	config.modules.model.options.truncation_symbol = "";
	assert.equal(renderModel("abcdefghijklmno"), "abcmno");
	config.modules.model.options.truncation_length = 0;
	assert.equal(renderModel("abcdefghijklmno"), "abcdefghijklmno");

	config.modules.model.options.truncation_length = 6;
	config.modules.model.options.truncation_symbol = "…";
	config.modules.model.options.truncation_direction = "end";
	assert.equal(renderModel("claude-sonnet-20241022"), "sonnet");
	assert.equal(renderModel("A👨‍👩‍👧‍👦BCDEFG"), "A👨‍👩‍👧‍👦BCDE…");

	const model = { provider: "llama.cpp", id: "ggml-org/gemma-4-E2B-it-GGUF:Q8_0" };
	renderStatusline(config, fixture({ model }));
	assert.equal(model.id, "ggml-org/gemma-4-E2B-it-GGUF:Q8_0");
});

test("model rendering strips terminal sequences from runtime IDs and truncation symbols", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$model";
	config.formatAst = [{ type: "variable", name: "model" }];
	config.modules.model.format = "$model";
	config.modules.model.formatAst = [{ type: "variable", name: "model" }];
	config.modules.model.options.truncation_length = 0;
	const renderModel = (id: string) =>
		renderStatusline(config, fixture({ model: { provider: "llama.cpp", id } })).ansi;

	assert.equal(
		renderModel("safe\x1b]8;;https://evil.example\x07click\x1b]8;;\x07\nmodel"),
		"safeclick model",
	);
	assert.equal(renderModel("a\u009d0;title\u009cb"), "ab");

	config.modules.model.options.truncation_length = 3;
	config.modules.model.options.truncation_symbol = "\x1b[31m!\x1b[0m";
	assert.equal(renderModel("abcdef"), "abc!");
});

test("$all expands enabled modules in default order without explicit duplicates", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$model$all";
	config.formatAst = [
		{ type: "variable", name: "model" },
		{ type: "variable", name: "all" },
	];
	const rendered = renderStatusline(config, fixture());
	const modelText = rendered.modules.model.map((chunk) => chunk.text).join("");
	assert.equal(rendered.ansi.split(modelText).length - 1, 1);
	assert.ok(rendered.ansi.indexOf("π") > rendered.ansi.indexOf(modelText));
	assert.match(rendered.ansi, /#7/);
});

test("Starship Git modules expose branch, commit, state, metrics, and detailed status", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$git_branch|$git_commit|$git_state|$git_metrics|$git_status";
	config.formatAst = [
		{ type: "variable", name: "git_branch" },
		{ type: "text", value: "|" },
		{ type: "variable", name: "git_commit" },
		{ type: "text", value: "|" },
		{ type: "variable", name: "git_state" },
		{ type: "text", value: "|" },
		{ type: "variable", name: "git_metrics" },
		{ type: "text", value: "|" },
		{ type: "variable", name: "git_status" },
	];
	config.modules.git_branch.format = "$branch:$remote_name/$remote_branch";
	config.modules.git_branch.formatAst = [
		{ type: "variable", name: "branch" },
		{ type: "text", value: ":" },
		{ type: "variable", name: "remote_name" },
		{ type: "text", value: "/" },
		{ type: "variable", name: "remote_branch" },
	];
	config.modules.git_commit.format = "$hash$tag";
	config.modules.git_commit.formatAst = [
		{ type: "variable", name: "hash" },
		{ type: "variable", name: "tag" },
	];
	config.modules.git_state.format = "$state:$progress_current/$progress_total";
	config.modules.git_state.formatAst = [
		{ type: "variable", name: "state" },
		{ type: "text", value: ":" },
		{ type: "variable", name: "progress_current" },
		{ type: "text", value: "/" },
		{ type: "variable", name: "progress_total" },
	];
	config.modules.git_metrics.disabled = false;
	config.modules.git_metrics.format = "+$added/-$deleted";
	config.modules.git_metrics.formatAst = [
		{ type: "text", value: "+" },
		{ type: "variable", name: "added" },
		{ type: "text", value: "/-" },
		{ type: "variable", name: "deleted" },
	];
	config.modules.git_status.format = "$all_status $ahead_behind";
	config.modules.git_status.formatAst = [
		{ type: "variable", name: "all_status" },
		{ type: "text", value: " " },
		{ type: "variable", name: "ahead_behind" },
	];

	const rendered = stripAnsi(
		renderStatusline(
			config,
			fixture({
				gitBranchDetails: {
					name: "feature/native-git",
					remoteName: "origin",
					remoteBranch: "main",
					detached: true,
				},
				gitCommit: { hash: "0123456789abcdef", tag: "v1.2.3", detached: true },
				gitState: { state: "REBASING", progressCurrent: 3, progressTotal: 10 },
				gitMetrics: { added: 12, deleted: 3 },
			}),
		).ansi,
	);
	assert.equal(
		rendered,
		"feature/native-git:origin/main|0123456 🏷 v1.2.3|REBASING:3/10|+12/-3|=1 !4 +3 ?5 ⇕⇡2⇣1",
	);
});

test("git worktree renders linked worktree values and stays empty for the primary worktree", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$git_worktree";
	config.formatAst = [{ type: "variable", name: "git_worktree" }];
	config.modules.git_worktree.format = "$name:$path";
	config.modules.git_worktree.formatAst = [
		{ type: "variable", name: "name" },
		{ type: "text", value: ":" },
		{ type: "variable", name: "path" },
	];

	assert.equal(
		stripAnsi(
			renderStatusline(
				config,
				fixture({
					gitWorktree: {
						name: "pi-extensions-feature",
						path: "/work/pi-extensions-feature",
					},
				}),
			).ansi,
		),
		"pi-extensions-feature:/work/pi-extensions-feature",
	);
	assert.equal(renderStatusline(config, fixture({ gitWorktree: undefined })).ansi, "");
});

test("first-wave workspace modules render documented snapshot variables", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	const names = [
		"package",
		"nodejs",
		"python",
		"rust",
		"golang",
		"bun",
		"deno",
		"mise",
		"direnv",
		"conda",
		"pixi",
		"nix_shell",
		"guix_shell",
		"docker_context",
		"kubernetes",
		"terraform",
		"aws",
		"gcloud",
		"azure",
		"openstack",
		"os",
		"container",
		"hostname",
		"username",
	] as const;
	config.format = names.map((name) => `$${name}`).join("|");
	config.formatAst = parseFormat(config.format);
	config.modules.os.disabled = false;
	for (const name of names) {
		config.modules[name].format = name === "package" || name === "nodejs" ? "$version" : "$symbol";
		config.modules[name].formatAst = parseFormat(config.modules[name].format);
	}
	const workspace: Record<string, Record<string, string>> = {};
	for (const [index, name] of names.entries()) {
		workspace[name] =
			name === "package" || name === "nodejs" ? { version: `v${index + 1}.0.0` } : {};
	}
	const rendered = stripAnsi(
		renderStatusline(config, fixture({ workspace: { modules: workspace } }), 400).ansi,
	);
	assert.match(rendered, /v1\.0\.0/);
	assert.match(rendered, /v2\.0\.0/);
	assert.match(rendered, /📦|||||🍞|🦕|mise|direnv|🅒|🧚||🐃||☸|💠|☁|󰠅|⬢|🌐/u);
	assert.equal(rendered.split("|").length, names.length);
});

test("activity handles parallel active tools, thinking, completed, and idle", () => {
	const text = (runtime: Partial<StarshipRuntimeSnapshot>) => {
		const config = structuredClone(BUILT_IN_CONFIG);
		config.format = "$activity";
		config.formatAst = [{ type: "variable", name: "activity" }];
		return stripAnsi(renderStatusline(config, fixture(runtime)).ansi);
	};
	assert.match(
		text({
			activeTools: new Map([
				["read", 2],
				["bash", 1],
			]),
		}),
		/read×2\+1/,
	);
	assert.match(text({ isStreaming: true, lastCompletedTool: undefined }), /thinking/);
	assert.match(text({ lastCompletedTool: "bash" }), /completed bash/);
	assert.match(text({ lastCompletedTool: undefined }), /idle/);
});

test("extension status icons match arbitrary exact keys and explicit namespace wildcards", () => {
	const aliases = new Map<string, string[]>();

	assert.equal(
		formatExtensionStatus("third_party/key", "running", { "third_party/key": "🧩" }, aliases),
		"🧩 running",
	);
	assert.equal(
		formatExtensionStatus("foo:server", "running", { "foo:*": "🧪", "foo:server": "🖥️" }, aliases),
		"🖥️ running",
	);
	assert.equal(
		formatExtensionStatus(
			"foo:server:worker",
			"running",
			{ "foo:*": "🧪", "foo:server:*": "⚙️" },
			aliases,
		),
		"⚙️ running",
	);
	assert.equal(formatExtensionStatus("foo:worker", "running", { "foo:*": "" }, aliases), "running");
	const packageAliases = buildExtensionStatusIconAliases([{ packageName: "@vendor/pi-foo" }]);
	assert.equal(
		formatExtensionStatus(
			"foo:worker",
			"running",
			{ "foo:*": "WILDCARD", "@vendor/pi-foo": "PACKAGE" },
			packageAliases,
		),
		"WILDCARD running",
	);
	for (const key of ["foo", "foobar", "foo/server"]) {
		assert.equal(formatExtensionStatus(key, "running", { "foo:*": "🧪" }, aliases), "🔌 running");
	}
});

test("extension status icons bridge canonical and legacy sync and retry keys", () => {
	const aliases = new Map<string, string[]>();

	assert.equal(formatExtensionStatus("sync", "pushing", {}, aliases), "🔄 pushing");
	assert.equal(formatExtensionStatus("retry", "retrying", {}, aliases), "🔁 retrying");
	assert.equal(formatExtensionStatus("pisync", "pushing", {}, aliases), "🔄 pushing");
	assert.equal(
		formatExtensionStatus("unknown-error-retry", "retrying", {}, aliases),
		"🔁 retrying",
	);
	assert.equal(
		formatExtensionStatus("sync", "pushing", { pisync: "CUSTOM-SYNC" }, aliases),
		"CUSTOM-SYNC pushing",
	);
	assert.equal(
		formatExtensionStatus("pisync", "pushing", { sync: "NEW-SYNC" }, aliases),
		"NEW-SYNC pushing",
	);
	assert.equal(
		formatExtensionStatus(
			"retry",
			"retrying",
			{ "unknown-error-retry": "CUSTOM-RETRY", retry: "NEW-RETRY" },
			aliases,
		),
		"NEW-RETRY retrying",
	);
});

test("extension status icons honor exact keys, aliases, suppression, defaults, and fallback", () => {
	const config = structuredClone(BUILT_IN_CONFIG);
	config.format = "$extension_status";
	config.formatAst = [{ type: "variable", name: "extension_status" }];
	config.extensionStatus.icons = {
		goal: "",
		"@vendor/pi-foo": "🧪",
		fallback: "•",
	};
	const aliases = buildExtensionStatusIconAliases([
		{ packageName: "@vendor/pi-foo", source: "npm:@vendor/pi-foo@1.2.3" },
	]);
	const rendered = renderStatusline(
		config,
		fixture({
			extensionStatuses: new Map([
				["goal", "active"],
				["foo:server", "running"],
				["unknown", "waiting"],
				["toString", "prototype safe"],
			]),
			extensionStatusIconAliases: aliases,
		}),
	).ansi;
	assert.match(rendered, /active/);
	assert.doesNotMatch(rendered, /🎯/);
	assert.match(rendered, /🧪 running/);
	assert.match(rendered, /• waiting/);
	assert.match(rendered, /• prototype safe/);
	assert.doesNotMatch(rendered, /🔌 waiting/);
});

test("format helpers stay compact and OSC links retain visible width", () => {
	assert.equal(formatCount(1530), "1.5k");
	assert.equal(shortenModel("claude-sonnet-4-20250514"), "sonnet-4");
	assert.equal(visibleWidth(LINK), 4);
});
