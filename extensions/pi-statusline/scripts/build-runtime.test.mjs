import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { SourceMap } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildRuntime, validateEagerGraph, validateGeneratedFiles } from "./build-runtime.mjs";

function validMetafile() {
	return {
		outputs: {
			"dist/statusline.ts": {
				entryPoint: "src/statusline.ts",
				imports: [
					{ path: "dist/chunk.ts", kind: "import-statement" },
					{ path: "dist/commands.ts", kind: "dynamic-import" },
					{
						path: "@earendil-works/pi-coding-agent",
						kind: "import-statement",
						external: true,
					},
				],
				inputs: { "src/statusline.ts": {} },
			},
			"dist/chunk.ts": {
				imports: [],
				inputs: { "src/settings.ts": {} },
			},
			"dist/commands.ts": {
				entryPoint: "src/commands.ts",
				imports: [{ path: "@narumitw/pi-tui-kit", kind: "dynamic-import", external: true }],
				inputs: { "src/commands.ts": {} },
			},
		},
	};
}

test("eager graph validation permits command UI behind a dynamic chunk", () => {
	assert.doesNotThrow(() => validateEagerGraph(validMetafile()));
});

test("eager graph validation rejects the command implementation", () => {
	const metafile = validMetafile();
	metafile.outputs["dist/chunk.ts"].inputs["src/commands.ts"] = {};
	assert.throws(() => validateEagerGraph(metafile), /Optional implementation is eager/u);
});

test("eager graph validation rejects Pi TUI Kit", () => {
	const metafile = validMetafile();
	metafile.outputs["dist/chunk.ts"].imports.push({
		path: "@narumitw/pi-tui-kit",
		kind: "import-statement",
		external: true,
	});
	assert.throws(() => validateEagerGraph(metafile), /Optional dependency is eager/u);
});

test("eager graph validation rejects bundled packages in lazy chunks", () => {
	const metafile = validMetafile();
	metafile.outputs["dist/commands.ts"].inputs["node_modules/example/index.js"] = {};
	assert.throws(() => validateEagerGraph(metafile), /Runtime package was bundled/u);
});

test("runtime builds are deterministic, mapped, and remove stale chunks", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "pi-statusline-build-test-"));
	t.after(() => rm(root, { force: true, recursive: true }));
	const first = join(root, "first");
	const second = join(root, "second");
	await buildRuntime({ outputDirectory: first });
	await mkdir(join(second, "chunks"), { recursive: true });
	await writeFile(join(second, "chunks", "stale.ts"), "stale");
	await buildRuntime({ outputDirectory: second });
	const firstSnapshot = await snapshotDirectory(first);
	const secondSnapshot = await snapshotDirectory(second);
	assert.equal(Object.hasOwn(secondSnapshot, "chunks/stale.ts"), false);
	assert.deepEqual(firstSnapshot, secondSnapshot);

	const runtime = await readFile(join(first, "statusline.ts"), "utf8");
	const generatedLine = runtime
		.split("\n")
		.findIndex((line) => line.includes('pi.registerCommand("statusline"'));
	assert.notEqual(generatedLine, -1);
	const sourceMap = new SourceMap(
		JSON.parse(await readFile(join(first, "statusline.ts.map"), "utf8")),
	);
	const mapped = sourceMap.findEntry(generatedLine, 0);
	assert.match(mapped.originalSource ?? "", /src\/statusline\.ts$/u);

	await rm(join(first, "statusline.ts.map"));
	await assert.rejects(validateGeneratedFiles(first), /Source map is missing for statusline\.ts/u);
});

async function snapshotDirectory(directory, prefix = "") {
	const snapshot = {};
	for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
		const path = join(prefix, entry.name);
		if (entry.isDirectory()) Object.assign(snapshot, await snapshotDirectory(directory, path));
		else if (entry.isFile()) snapshot[path] = await readFile(join(directory, path), "base64");
	}
	return snapshot;
}
