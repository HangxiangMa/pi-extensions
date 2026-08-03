import assert from "node:assert/strict";
import {
	access,
	mkdtemp,
	readdir,
	readFile,
	rm,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	awaitPlanModeSettingsWrites,
	normalizePlanModeSettings,
	readPlanModeSettings,
	updatePlanModeSettings,
} from "../src/settings.js";

test("Plan-mode settings validate inherit and fixed thinking levels", async () => {
	assert.deepEqual(normalizePlanModeSettings({}), { thinkingLevel: "inherit" });
	assert.deepEqual(normalizePlanModeSettings({ thinkingLevel: "medium" }), {
		thinkingLevel: "medium",
	});
	assert.deepEqual(normalizePlanModeSettings({ thinkingLevel: "max" }), {
		thinkingLevel: "max",
	});
	assert.equal(normalizePlanModeSettings({ thinkingLevel: "extreme" }), undefined);

	const directory = await mkdtemp(join(tmpdir(), "pi-plan-mode-test-"));
	try {
		const path = join(directory, "pi-plan-mode.json");
		await writeFile(path, '{"thinkingLevel":"high"}');
		assert.deepEqual(await readPlanModeSettings(path), {
			kind: "loaded",
			settings: { thinkingLevel: "high" },
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("Plan-mode settings normalize default tool names strictly", async () => {
	assert.deepEqual(
		normalizePlanModeSettings({
			thinkingLevel: "medium",
			defaultPlanTools: ["bash", "read", "bash", "grep"],
		}),
		{
			thinkingLevel: "medium",
			defaultPlanTools: ["bash", "read", "grep"],
		},
	);
	assert.deepEqual(normalizePlanModeSettings({ defaultPlanTools: [] }), {
		thinkingLevel: "inherit",
		defaultPlanTools: [],
	});
	for (const defaultPlanTools of ["read", [""], ["   "], ["read", 42]]) {
		assert.equal(normalizePlanModeSettings({ defaultPlanTools }), undefined);
	}

	const directory = await mkdtemp(join(tmpdir(), "pi-plan-mode-default-tools-test-"));
	try {
		const path = join(directory, "pi-plan-mode.json");
		await writeFile(path, '{"defaultPlanTools":["read","bash","read"]}');
		assert.deepEqual(await readPlanModeSettings(path), {
			kind: "loaded",
			settings: {
				thinkingLevel: "inherit",
				defaultPlanTools: ["read", "bash"],
			},
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("Plan-mode settings ignore unknown top-level fields", () => {
	assert.deepEqual(
		normalizePlanModeSettings({
			thinkingLevel: "medium",
			futureOption: { enabled: true },
		}),
		{ thinkingLevel: "medium" },
	);
});

test("Plan-mode settings validate safe subcommands strictly", async () => {
	assert.deepEqual(
		normalizePlanModeSettings({
			thinkingLevel: "medium",
			defaultPlanTools: ["read", "bash"],
			safeSubcommands: {
				git: ["status", "rev-parse", "status", "cat-file"],
				gh: ["pr view", "issue list", "pr view"],
			},
		}),
		{
			thinkingLevel: "medium",
			defaultPlanTools: ["read", "bash"],
			safeSubcommands: {
				git: ["status", "rev-parse", "cat-file"],
				gh: ["pr view", "issue list"],
			},
		},
	);
	assert.deepEqual(normalizePlanModeSettings({ safeSubcommands: {} }), {
		thinkingLevel: "inherit",
		safeSubcommands: {},
	});
	assert.deepEqual(normalizePlanModeSettings({ safeSubcommands: { git: [], gh: [] } }), {
		thinkingLevel: "inherit",
		safeSubcommands: { git: [], gh: [] },
	});

	for (const safeSubcommands of [
		null,
		[],
		{ kubectl: ["get"] },
		{ git: "status" },
		{ git: ["checkout"] },
		{ git: ["status", 42] },
		{ gh: ["pr merge"] },
		{ gh: ["pr view", ""] },
	]) {
		assert.equal(normalizePlanModeSettings({ safeSubcommands }), undefined);
	}
});

test("Plan-mode settings updates create only on explicit save and preserve unknown fields", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-plan-mode-settings-update-"));
	const settingsPath = join(directory, "nested", "pi-plan-mode.json");
	try {
		assert.deepEqual(await readPlanModeSettings(settingsPath), { kind: "missing" });
		await assert.rejects(access(settingsPath));

		await updatePlanModeSettings(
			{ thinkingLevel: "high", defaultPlanTools: ["read", "bash"] },
			{ settingsPath },
		);
		await writeFile(
			settingsPath,
			'{"future":{"kept":true},"thinkingLevel":"high","defaultPlanTools":["read","bash"],"safeSubcommands":{"gh":["pr view"]}}\n',
		);
		await updatePlanModeSettings(
			{ thinkingLevel: "medium", defaultPlanTools: null },
			{ settingsPath },
		);

		assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), {
			future: { kept: true },
			thinkingLevel: "medium",
			safeSubcommands: { gh: ["pr view"] },
		});
		assert.deepEqual(await readPlanModeSettings(settingsPath), {
			kind: "loaded",
			settings: {
				thinkingLevel: "medium",
				safeSubcommands: { gh: ["pr view"] },
			},
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("Plan-mode settings explicit save promotes valid legacy content without modifying it", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-plan-mode-settings-promote-"));
	const settingsPath = join(directory, "pi-plan-mode.json");
	const legacySettingsPath = join(directory, "plan-mode.json");
	const legacy = '{"thinkingLevel":"low","defaultPlanTools":["read"],"future":{"kept":true}}\n';
	try {
		await writeFile(legacySettingsPath, legacy);
		await updatePlanModeSettings({ thinkingLevel: "high" }, { settingsPath, legacySettingsPath });

		assert.equal(await readFile(legacySettingsPath, "utf8"), legacy);
		assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), {
			thinkingLevel: "high",
			defaultPlanTools: ["read"],
			future: { kept: true },
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("Plan-mode settings refuse invalid documents and preserve atomic publication failures", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-plan-mode-settings-invalid-"));
	const settingsPath = join(directory, "pi-plan-mode.json");
	try {
		for (const invalid of ["{mock-sensitive-token", '{"thinkingLevel":"huge"}\n']) {
			await writeFile(settingsPath, invalid);
			await assert.rejects(
				updatePlanModeSettings({ thinkingLevel: "high" }, { settingsPath }),
				(error: unknown) => {
					assert.match(String(error), /invalid (?:JSON|settings shape)/i);
					assert.doesNotMatch(String(error), /mock-sensitive-token/);
					return true;
				},
			);
			assert.equal(await readFile(settingsPath, "utf8"), invalid);
		}

		const invalidUtf8 = Buffer.from([0x7b, 0xff, 0x7d]);
		await writeFile(settingsPath, invalidUtf8);
		const invalidUtf8Result = await readPlanModeSettings(settingsPath);
		assert.match(invalidUtf8Result.kind === "invalid" ? invalidUtf8Result.reason : "", /UTF-8/i);
		await assert.rejects(
			updatePlanModeSettings({ thinkingLevel: "high" }, { settingsPath }),
			/UTF-8/i,
		);
		assert.deepEqual(await readFile(settingsPath), invalidUtf8);

		const oversized = Buffer.alloc(64 * 1024 + 1, 0x20);
		await writeFile(settingsPath, oversized);
		const oversizedResult = await readPlanModeSettings(settingsPath);
		assert.match(
			oversizedResult.kind === "invalid" ? oversizedResult.reason : "",
			/exceeds .* bytes/i,
		);
		await assert.rejects(
			updatePlanModeSettings({ thinkingLevel: "high" }, { settingsPath }),
			/exceeds .* bytes/i,
		);
		assert.deepEqual(await readFile(settingsPath), oversized);

		await writeFile(settingsPath, '{"thinkingLevel":"low","future":true}\n');
		const before = await readFile(settingsPath, "utf8");
		await assert.rejects(
			updatePlanModeSettings(
				{ thinkingLevel: "high" },
				{
					settingsPath,
					beforeRename: async () => {
						throw new Error("publication failed");
					},
				},
			),
			/publication failed/,
		);
		assert.equal(await readFile(settingsPath, "utf8"), before);
		assert.deepEqual(await readdir(directory), ["pi-plan-mode.json"]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("Plan-mode settings serialize updates, coordinate reads, and recover after failure", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-plan-mode-settings-order-"));
	const settingsPath = join(directory, "pi-plan-mode.json");
	let releaseFirst!: () => void;
	let markFirstReached!: () => void;
	const firstReached = new Promise<void>((resolve) => {
		markFirstReached = resolve;
	});
	const firstGate = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	try {
		const first = updatePlanModeSettings(
			{ thinkingLevel: "low" },
			{
				settingsPath,
				beforeRename: async () => {
					markFirstReached();
					await firstGate;
				},
			},
		);
		const second = updatePlanModeSettings({ thinkingLevel: "medium" }, { settingsPath });
		const coordinatedRead = readPlanModeSettings(settingsPath);
		await firstReached;
		releaseFirst();
		await Promise.all([first, second]);
		assert.deepEqual(await coordinatedRead, {
			kind: "loaded",
			settings: { thinkingLevel: "medium" },
		});

		await assert.rejects(
			updatePlanModeSettings(
				{ thinkingLevel: "high" },
				{
					settingsPath,
					beforeRename: async () => Promise.reject(new Error("failed once")),
				},
			),
			/failed once/,
		);
		await updatePlanModeSettings({ thinkingLevel: "max" }, { settingsPath });
		await awaitPlanModeSettingsWrites(settingsPath);
		assert.equal(
			(JSON.parse(await readFile(settingsPath, "utf8")) as { thinkingLevel: string }).thinkingLevel,
			"max",
		);
	} finally {
		releaseFirst();
		await rm(directory, { recursive: true, force: true });
	}
});

test("Plan-mode settings abort before publication without creating the canonical file", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-plan-mode-settings-abort-"));
	const settingsPath = join(directory, "pi-plan-mode.json");
	const controller = new AbortController();
	try {
		await assert.rejects(
			updatePlanModeSettings(
				{ thinkingLevel: "high" },
				{
					settingsPath,
					signal: controller.signal,
					beforeRename: async () => controller.abort(new Error("settings disposed")),
				},
			),
			/settings disposed/,
		);
		await assert.rejects(access(settingsPath));
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("Plan-mode settings read legacy files without modifying them", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-plan-mode-migration-"));
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = directory;
	try {
		await writeFile(
			join(directory, "plan-mode.json"),
			'{"thinkingLevel":"high","safeSubcommands":{"gh":["pr view"]},"futureOption":true}',
		);
		const loaded = await readPlanModeSettings();
		assert.equal(loaded.kind, "loaded");
		assert.deepEqual(loaded.kind === "loaded" ? loaded.settings : undefined, {
			thinkingLevel: "high",
			safeSubcommands: { gh: ["pr view"] },
		});
		assert.match(loaded.notice ?? "", /using legacy/i);
		assert.deepEqual(JSON.parse(await readFile(join(directory, "plan-mode.json"), "utf8")), {
			thinkingLevel: "high",
			safeSubcommands: { gh: ["pr view"] },
			futureOption: true,
		});
		await assert.rejects(access(join(directory, "pi-plan-mode.json")));

		await writeFile(join(directory, "plan-mode.json"), '{"thinkingLevel":"low"}');
		await writeFile(join(directory, "pi-plan-mode.json"), '{"thinkingLevel":"medium"}');
		const preferred = await readPlanModeSettings();
		assert.deepEqual(preferred.kind === "loaded" ? preferred.settings : undefined, {
			thinkingLevel: "medium",
		});
		assert.match(preferred.notice ?? "", /ignored/i);

		await writeFile(join(directory, "pi-plan-mode.json"), "invalid");
		const invalid = await readPlanModeSettings();
		assert.equal(invalid.kind, "invalid");
		assert.equal(
			await readFile(join(directory, "plan-mode.json"), "utf8"),
			'{"thinkingLevel":"low"}',
		);

		await unlink(join(directory, "pi-plan-mode.json"));
		await writeFile(join(directory, "plan-mode.json"), "invalid");
		assert.equal((await readPlanModeSettings()).kind, "invalid");
		await assert.rejects(access(join(directory, "pi-plan-mode.json")));

		await writeFile(join(directory, "plan-mode.json"), '{"thinkingLevel":"high"}');
		await symlink("missing-target", join(directory, "pi-plan-mode.json"));
		const linked = await readPlanModeSettings();
		assert.equal(linked.kind, "invalid");
		assert.match(linked.kind === "invalid" ? linked.reason : "", /regular file/i);
		assert.equal(
			await readFile(join(directory, "plan-mode.json"), "utf8"),
			'{"thinkingLevel":"high"}',
		);
	} finally {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		await rm(directory, { recursive: true, force: true });
	}
});
