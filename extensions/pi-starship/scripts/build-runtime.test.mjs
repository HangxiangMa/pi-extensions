import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { SourceMap } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildRuntime, validateEagerGraph, validateGeneratedFiles } from "./build-runtime.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function validMetafile() {
	return {
		outputs: {
			"dist/pi-starship.ts": {
				entryPoint: "src/pi-starship.ts",
				imports: [
					{ path: "dist/chunk.ts", kind: "import-statement" },
					{ path: "dist/commands.ts", kind: "dynamic-import" },
					{
						path: "@earendil-works/pi-coding-agent",
						kind: "import-statement",
						external: true,
					},
				],
				inputs: { "src/pi-starship.ts": {} },
			},
			"dist/chunk.ts": {
				imports: [],
				inputs: { "src/config.ts": {} },
			},
			"dist/commands.ts": {
				entryPoint: "src/commands.ts",
				imports: [{ path: "@narumitw/pi-tui-kit", kind: "import-statement", external: true }],
				inputs: { "src/commands.ts": {} },
			},
		},
	};
}

test("eager graph validation permits optional dependencies behind dynamic chunks", () => {
	assert.doesNotThrow(() => validateEagerGraph(validMetafile()));
});

test("eager graph validation rejects optional implementations", () => {
	const metafile = validMetafile();
	metafile.outputs["dist/chunk.ts"].inputs["src/commands.ts"] = {};
	assert.throws(() => validateEagerGraph(metafile), /Optional implementation is eager/u);
});

test("eager graph validation rejects optional external dependencies", () => {
	const metafile = validMetafile();
	metafile.outputs["dist/chunk.ts"].imports.push({
		path: "yaml",
		kind: "import-statement",
		external: true,
	});
	assert.throws(() => validateEagerGraph(metafile), /Optional dependency is eager: yaml/u);
});

test("eager graph validation rejects bundled packages", () => {
	const metafile = validMetafile();
	metafile.outputs["dist/commands.ts"].inputs["node_modules/example/index.js"] = {};
	assert.throws(() => validateEagerGraph(metafile), /Runtime package was bundled/u);
});

test("runtime builds reject output directories outside or equal to the package root", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "pi-starship-build-outside-test-"));
	t.after(() => rm(root, { force: true, recursive: true }));
	await assert.rejects(
		buildRuntime({ outputDirectory: join(root, "dist") }),
		/Runtime output directory must be inside the package root/u,
	);
	await assert.rejects(
		buildRuntime({ outputDirectory: packageRoot }),
		/Runtime output directory must be inside the package root/u,
	);
});

test("runtime builds are byte-for-byte deterministic", async (t) => {
	const root = await mkdtemp(join(packageRoot, ".pi-starship-build-test-"));
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

	const runtime = await readFile(join(first, "pi-starship.ts"), "utf8");
	const generatedLine = runtime
		.split("\n")
		.findIndex((line) => line.includes('pi.registerCommand("starship"'));
	assert.notEqual(generatedLine, -1);
	const sourceMap = new SourceMap(
		JSON.parse(await readFile(join(first, "pi-starship.ts.map"), "utf8")),
	);
	const mapped = sourceMap.findEntry(generatedLine, 0);
	assert.match(mapped.originalSource ?? "", /src\/pi-starship\.ts$/u);

	await rm(join(first, "pi-starship.ts.map"));
	await assert.rejects(validateGeneratedFiles(first), /Source map is missing for pi-starship\.ts/u);
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
