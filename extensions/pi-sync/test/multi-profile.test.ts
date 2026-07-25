import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
} from "../../../test/support.js";
import {
	deprecatedPiSyncEnvironmentWarnings,
	loadConfig,
	localConfigPath,
	readLocalConfigObject,
	readStateForConfig,
	stateDir,
	writeStateForConfig,
} from "../src/config.js";
import { migrateLegacySettings } from "../src/settings-management.js";
import { recoverPendingSnapshotTransactions } from "../src/snapshot-transaction.js";
import sync, { parseOptions } from "../src/sync.js";
import { useSyncTarget } from "../src/target-switch.js";

initTheme("dark", false);

const ENV_KEYS = [
	"PI_CODING_AGENT_DIR",
	"PI_SYNC_ENDPOINT",
	"PI_SYNC_BUCKET",
	"PI_SYNC_REGION",
	"PI_SYNC_ACCESS_KEY_ID",
	"PI_SYNC_SECRET_ACCESS_KEY",
	"PI_SYNC_SESSION_TOKEN",
	"PI_SYNC_PROFILE",
	"PI_SYNC_PREFIX",
	"PI_SYNC_AUTO_SYNC",
	"PI_SYNC_SESSIONS",
	"AWS_ACCESS_KEY_ID",
	"AWS_SECRET_ACCESS_KEY",
	"AWS_SESSION_TOKEN",
	"AWS_REGION",
	"R2_ENDPOINT",
	"R2_BUCKET",
] as const;

test("v2 settings resolve reusable storage profiles and named targets", async () => {
	await withTempSettings(async () => {
		writeSettings({
			version: 2,
			activeTarget: "home",
			profiles: {
				r2: {
					kind: "r2",
					endpoint: "https://account.r2.cloudflarestorage.com",
					region: "auto",
					accessKeyId: "r2-access",
					secretAccessKey: "r2-secret",
				},
				s3: {
					kind: "s3-compatible",
					endpoint: "https://s3.example.com",
					region: "ap-northeast-1",
					accessKeyId: "s3-access",
					secretAccessKey: "s3-secret",
				},
			},
			targets: {
				home: {
					profile: "r2",
					bucket: "personal-pi",
					prefix: "pi-sync",
					namespace: "home-space",
					autoSync: true,
					syncFiles: ["settings.json", "skills"],
					syncSessions: false,
					extraFiles: [],
				},
				work: {
					profile: "s3",
					bucket: "company-pi",
					prefix: "developers/narumi",
					namespace: "work-space",
					autoSync: false,
					syncFiles: ["AGENTS.md"],
					syncSessions: true,
					extraFiles: ["LOCAL.md"],
				},
			},
			future: { retained: true },
		});

		const home = await loadConfig();
		assert.equal(home.target, "home");
		assert.equal(home.storageProfile, "r2");
		assert.equal(home.profile, "home-space");
		assert.equal(home.bucket, "personal-pi");
		assert.equal(home.autoSync, true);
		assert.deepEqual(home.syncFiles, ["settings.json", "skills"]);

		const work = await loadConfig("work");
		assert.equal(work.target, "work");
		assert.equal(work.storageProfile, "s3");
		assert.equal(work.profile, "work-space");
		assert.equal(work.bucket, "company-pi");
		assert.equal(work.autoSync, false);
		assert.equal(work.syncSessions, true);
		assert.deepEqual(work.extraFiles, ["LOCAL.md"]);
	});
});

test("standard AWS and R2 aliases still override the selected profile and target", async () => {
	await withTempSettings(async () => {
		writeSettings(v2Settings());
		process.env.AWS_ACCESS_KEY_ID = "aws-access";
		process.env.AWS_SECRET_ACCESS_KEY = "aws-secret";
		process.env.AWS_SESSION_TOKEN = "aws-session";
		process.env.AWS_REGION = "us-west-2";
		process.env.R2_ENDPOINT = "https://override.r2.cloudflarestorage.com";
		process.env.R2_BUCKET = "override-bucket";

		const config = await loadConfig();
		assert.equal(config.endpoint, "https://override.r2.cloudflarestorage.com");
		assert.equal(config.bucket, "override-bucket");
		assert.equal(config.region, "us-west-2");
		assert.equal(config.accessKeyId, "aws-access");
		assert.equal(config.secretAccessKey, "aws-secret");
		assert.equal(config.sessionToken, "aws-session");
	});
});

test("deprecated PI_SYNC variables retain precedence and warnings never reveal values", async () => {
	await withTempSettings(async () => {
		writeSettings(v2Settings());
		process.env.PI_SYNC_BUCKET = "deprecated-bucket-value";
		process.env.PI_SYNC_PROFILE = "deprecated-namespace-value";

		const config = await loadConfig();
		assert.equal(config.bucket, "deprecated-bucket-value");
		assert.equal(config.profile, "deprecated-namespace-value");
		const warning = deprecatedPiSyncEnvironmentWarnings().join("\n");
		assert.match(warning, /PI_SYNC_BUCKET/);
		assert.match(warning, /PI_SYNC_PROFILE/);
		assert.match(warning, /future major version/);
		assert.doesNotMatch(warning, /deprecated-(bucket|namespace)-value/);
	});
});

test("bare sync menu shows the current target and goal-oriented actions", async () => {
	await withTempSettings(async () => {
		writeSettings(v2Settings());
		const mock = createMockPi();
		sync(mock.pi);
		const calls: Array<{ title: string; options: string[] }> = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string, options: string[]) => {
				calls.push({ title, options });
				return undefined;
			},
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.match(calls[0]?.title ?? "", /Current target: home/);
		assert.match(calls[0]?.title ?? "", /Cloudflare R2.*personal-pi/);
		assert.match(calls[0]?.title ?? "", /Auto-sync: On.*Sessions: Off/);
		assert.deepEqual(calls[0]?.options, [
			"Sync now",
			"Switch target",
			"Status & changes",
			"Settings",
			"Manage targets & storage",
			"History & recovery",
			"Help",
		]);
	});
});

test("bare sync presents malformed settings as a read-only repair state", async () => {
	await withTempSettings(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), "{broken");
		let title = "";
		let options: string[] = [];
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx } = createMockContext({
			hasUI: true,
			select: async (nextTitle: string, nextOptions: string[]) => {
				title = nextTitle;
				options = nextOptions;
				return undefined;
			},
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.match(title, /Settings file needs repair/);
		assert.deepEqual(options, ["Help"]);
		assert.equal(readFileSync(localConfigPath(), "utf8"), "{broken");
	});
});

test("bare sync disables mutations and exposes recovery while a live lock is held", async () => {
	await withTempSettings(async () => {
		writeSettings(v2Settings());
		mkdirSync(stateDir(), { recursive: true });
		writeFileSync(
			path.join(stateDir(), "lock"),
			JSON.stringify({
				id: "live-operation",
				pid: process.pid,
				command: "pull",
				startedAt: new Date().toISOString(),
			}),
		);
		const mock = createMockPi();
		sync(mock.pi);
		let title = "";
		let options: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			select: async (nextTitle: string, nextOptions: string[]) => {
				title = nextTitle;
				options = nextOptions;
				return undefined;
			},
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.match(title, /Operation in progress: pull/);
		assert.doesNotMatch(options.join("\n"), /Sync now|Settings|Switch target/);
		assert.deepEqual(options, ["Status & changes", "History & recovery", "Help"]);
	});
});

test("Sync now read-only check aborts from Escape before any publication", async () => {
	await withTempSettings(async () => {
		writeSettings(v2Settings());
		const before = readFileSync(localConfigPath(), "utf8");
		const originalFetch = globalThis.fetch;
		let putCalls = 0;
		let aborted = false;
		globalThis.fetch = ((_input, init) => {
			if (init?.method === "PUT") putCalls += 1;
			return new Promise<Response>((_resolve, reject) => {
				if (init?.signal?.aborted) {
					aborted = true;
					reject(new DOMException("Aborted", "AbortError"));
					return;
				}
				init?.signal?.addEventListener(
					"abort",
					() => {
						aborted = true;
						reject(new DOMException("Aborted", "AbortError"));
					},
					{ once: true },
				);
			});
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			let selectCount = 0;
			const { ctx, notifications } = createMockContext({
				hasUI: true,
				mode: "tui",
				select: async () => (selectCount++ === 0 ? "Sync now" : undefined),
				custom: async (factory: unknown) => {
					const loader = createCustomSelectorHarness(factory, 60);
					loader.handleInput("\u001b");
					loader.dispose();
					return loader.result;
				},
			});

			await mock.commands.get("sync")?.handler("", ctx);

			assert.equal(aborted, true);
			assert.equal(putCalls, 0);
			assert.equal(readFileSync(localConfigPath(), "utf8"), before);
			assert.match(notifications.map((item) => item.message).join("\n"), /cancelled/);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("switch target asks to pull by default and declining leaves local files unchanged", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.profiles.s3 = {
			endpoint: "https://s3.example.com",
			region: "ap-northeast-1",
			accessKeyId: "s3-access",
			secretAccessKey: "s3-secret",
		};
		settings.targets.work = {
			profile: "s3",
			bucket: "company-pi",
			namespace: "work",
			prefix: "pi-sync",
			autoSync: false,
			syncFiles: ["AGENTS.md"],
			syncSessions: false,
			extraFiles: [],
		};
		writeSettings(settings);
		const mock = createMockPi();
		sync(mock.pi);
		const selections = ["Switch target", "work", "Switch to work", undefined];
		const calls: Array<{ title: string; options: string[] }> = [];
		let pullPrompt = "";
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string, options: string[]) => {
				calls.push({ title, options });
				return selections.shift();
			},
			confirm: async (title: string, message: string) => {
				pullPrompt = `${title}\n${message}`;
				return false;
			},
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.match(calls[1]?.title ?? "", /Current target: home/);
		assert.deepEqual(calls[1]?.options, [
			"home (current) · r2 · personal-pi · 1 groups · Sessions: Off",
			"work · s3 · company-pi · 1 groups · Sessions: Off",
			"Back",
		]);
		assert.match(calls[2]?.title ?? "", /From: home/);
		assert.match(calls[2]?.title ?? "", /To: work/);
		assert.match(calls[2]?.title ?? "", /ask whether to pull/i);
		assert.match(pullPrompt, /Pull target “work” now\?/);
		assert.match(pullPrompt, /selected local files/i);
		assert.equal((await readLocalConfigObject())?.activeTarget, "work");
		assert.match(notifications.at(-1)?.message ?? "", /Switched to “work”.*not pulled/i);
	});
});

test("accepting the default post-switch prompt starts a pull", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		writeSettings(settings);
		let pullCalls = 0;
		let promptTitle = "";
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			confirm: async (title: string) => {
				promptTitle = title;
				return true;
			},
		});

		const result = await useSyncTarget(ctx, "work", async () => {
			pullCalls += 1;
		});

		assert.match(promptTitle, /Pull target “work” now\?/);
		assert.equal(pullCalls, 1);
		assert.equal(result.pullAttempted, true);
	});
});

test("always-pull target switching skips confirmation and applies remote settings", async () => {
	await withTempSettings(async (agentDir) => {
		const settings = v2Settings();
		settings.targetSwitchAction = "pull";
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		writeSettings(settings);
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(path.join(agentDir, "settings.json"), '{"local":true}\n');
		const remoteSnapshot = snapshotPayload("work-snapshot", '{"remote":true}\n');
		remoteSnapshot.profile = "work";
		const encoded = gzipSync(Buffer.from(JSON.stringify(remoteSnapshot)));
		const pointer = {
			version: 1,
			profile: "work",
			snapshot: remoteSnapshot.id,
			sha256: createHash("sha256").update(encoded).digest("hex"),
			createdAt: remoteSnapshot.createdAt,
			machine: remoteSnapshot.machine,
		};
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (input) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("/profiles/work/latest.json")) return Response.json(pointer);
			if (url.pathname.endsWith(`/profiles/work/snapshots/${remoteSnapshot.id}.json.gz`)) {
				return new Response(new Uint8Array(encoded));
			}
			throw new Error(`Unexpected request: ${url.pathname}`);
		}) as typeof globalThis.fetch;
		try {
			const confirmationTitles: string[] = [];
			let reloads = 0;
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx, notifications } = createMockContext({
				hasUI: true,
				mode: "tui",
				confirm: async (title: string) => {
					confirmationTitles.push(title);
					return title === "Reload Pi resources now?";
				},
				reload: async () => {
					reloads += 1;
				},
			});

			await mock.commands.get("sync")?.handler("use work", ctx);

			assert.deepEqual(confirmationTitles, ["Reload Pi resources now?"]);
			assert.equal((await readLocalConfigObject())?.activeTarget, "work");
			assert.equal(readFileSync(path.join(agentDir, "settings.json"), "utf8"), '{"remote":true}\n');
			assert.equal(reloads, 1);
			assert.match(notifications.map((item) => item.message).join("\n"), /Pulled 1 files/);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("always-pull keeps the switched target and reports a pull failure", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targetSwitchAction = "pull";
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		writeSettings(settings);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx, notifications } = createMockContext();

			await mock.commands.get("sync")?.handler("use work", ctx);

			assert.equal((await readLocalConfigObject())?.activeTarget, "work");
			assert.match(notifications[0]?.message ?? "", /Switched to “work”.*Pulling/);
			assert.match(notifications.at(-1)?.message ?? "", /Remote is empty/);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("cancelling an automatic post-switch pull reports that the target remains switched", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targetSwitchAction = "pull";
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		writeSettings(settings);
		const originalFetch = globalThis.fetch;
		let aborted = false;
		globalThis.fetch = ((_input, init) =>
			new Promise<Response>((_resolve, reject) => {
				if (init?.signal?.aborted) {
					aborted = true;
					reject(new DOMException("Aborted", "AbortError"));
					return;
				}
				init?.signal?.addEventListener(
					"abort",
					() => {
						aborted = true;
						reject(new DOMException("Aborted", "AbortError"));
					},
					{ once: true },
				);
			})) as typeof globalThis.fetch;
		try {
			const selections = ["Switch target", "work", "Switch to work"];
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx, notifications } = createMockContext({
				hasUI: true,
				mode: "tui",
				select: async () => selections.shift(),
				custom: async (factory: unknown) => {
					const loader = createCustomSelectorHarness(factory, 60);
					loader.handleInput("\u001b");
					loader.dispose();
					return loader.result;
				},
			});

			await mock.commands.get("sync")?.handler("", ctx);

			assert.equal(aborted, true);
			assert.equal((await readLocalConfigObject())?.activeTarget, "work");
			assert.match(
				notifications.at(-1)?.message ?? "",
				/Pull cancelled; the target was switched, but synced files were not changed/,
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("switch-only target setting retains the previous no-pull behavior", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targetSwitchAction = "switch-only";
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		settings.future = { retained: true };
		writeSettings(settings);
		const mock = createMockPi();
		sync(mock.pi);
		let confirmations = 0;
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			confirm: async () => {
				confirmations += 1;
				return true;
			},
		});

		await mock.commands.get("sync")?.handler("use work", ctx);

		const saved = await readLocalConfigObject();
		assert.equal(confirmations, 0);
		assert.equal(saved?.activeTarget, "work");
		assert.deepEqual(saved?.future, { retained: true });
		assert.match(notifications.at(-1)?.message ?? "", /No files were pulled/);
	});
});

test("settings menu persists the target-switch action and preserves unknown fields", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.future = { retained: true };
		writeSettings(settings);
		const selections = ["Settings", "After switching target", "Always pull", undefined];
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => selections.shift(),
		});

		await mock.commands.get("sync")?.handler("", ctx);

		const saved = await readLocalConfigObject();
		assert.equal(saved?.targetSwitchAction, "pull");
		assert.deepEqual(saved?.future, { retained: true });
	});
});

test("cancelling a target switch leaves settings byte-for-byte unchanged", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		writeSettings(settings);
		const before = JSON.stringify(await readLocalConfigObject());
		const mock = createMockPi();
		sync(mock.pi);
		const selections = ["Switch target", "work", "Cancel", undefined];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => selections.shift(),
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.equal(JSON.stringify(await readLocalConfigObject()), before);
	});
});

test("first-time R2 setup recommends home/r2/pi-sync defaults without raw path questions", async () => {
	await withTempSettings(async () => {
		process.env.AWS_ACCESS_KEY_ID = "setup-access-secret";
		process.env.AWS_SECRET_ACCESS_KEY = "setup-secret-value";
		const mock = createMockPi();
		sync(mock.pi);
		const selections = [
			"Set up sync",
			"Cloudflare R2",
			"Personal / Home",
			"Use suggested location (recommended)",
			"Use environment credentials",
			"Recommended Pi settings",
			"Enable automatic sync",
			"Keep sessions off (recommended)",
			"Save setup",
			undefined,
		];
		const inputs = ["https://account.r2.cloudflarestorage.com"];
		const rendered: string[] = [];
		const inputTitles: string[] = [];
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				rendered.push(title);
				return selections.shift();
			},
			input: async (title: string) => {
				inputTitles.push(title);
				return inputs.shift();
			},
		});

		await mock.commands.get("sync")?.handler("", ctx);

		const saved = await readLocalConfigObject();
		const profile = (saved?.profiles as Record<string, Record<string, unknown>> | undefined)?.r2;
		const target = (saved?.targets as Record<string, Record<string, unknown>> | undefined)?.home;
		assert.equal(saved?.version, 2);
		assert.equal(saved?.activeTarget, "home");
		assert.equal(profile?.kind, "r2");
		assert.equal(target?.profile, "r2");
		assert.equal(target?.bucket, "pi-sync");
		assert.equal(target?.prefix, "pi-sync");
		assert.equal(target?.namespace, "home");
		assert.deepEqual(inputTitles, ["Cloudflare R2 endpoint"]);
		assert.match(rendered.join("\n"), /Bucket must already exist/);
		assert.match(rendered.join("\n"), /pi-sync\/profiles\/home/);
		assert.match(notifications.at(-1)?.message ?? "", /Target “home” is ready/);
		assert.doesNotMatch(rendered.join("\n"), /setup-access-secret|setup-secret-value/);
	});
});

test("first-time S3 setup asks only for the existing bucket and derives work defaults", async () => {
	await withTempSettings(async () => {
		const mock = createMockPi();
		sync(mock.pi);
		const selections = [
			"Set up sync",
			"Other S3-compatible storage",
			"Work",
			"Use existing bucket with suggested path (recommended)",
			"Create private settings template",
			"Minimal settings",
			"Keep automatic sync off",
			"Keep sessions off (recommended)",
			"Save setup",
			undefined,
		];
		const inputs = ["https://s3.example.com", "ap-northeast-1", "company-pi"];
		const inputTitles: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => selections.shift(),
			input: async (title: string) => {
				inputTitles.push(title);
				return inputs.shift();
			},
		});

		await mock.commands.get("sync")?.handler("", ctx);

		const saved = await readLocalConfigObject();
		const profile = (saved?.profiles as Record<string, Record<string, unknown>> | undefined)?.s3;
		const target = (saved?.targets as Record<string, Record<string, unknown>> | undefined)?.work;
		assert.equal(saved?.activeTarget, "work");
		assert.equal(profile?.kind, "s3-compatible");
		assert.equal(target?.bucket, "company-pi");
		assert.equal(target?.prefix, "pi-sync");
		assert.equal(target?.namespace, "work");
		assert.deepEqual(inputTitles, ["S3-compatible endpoint", "Storage region", "Existing bucket"]);
	});
});

test("first-time setup keeps advanced profile and remote-location customization", async () => {
	await withTempSettings(async () => {
		const mock = createMockPi();
		sync(mock.pi);
		const selections = [
			"Set up sync",
			"Cloudflare R2",
			"Custom",
			"Customize remote location",
			"Create private settings template",
			"Minimal settings",
			"Keep automatic sync off",
			"Keep sessions off (recommended)",
			"Save setup",
			undefined,
		];
		const inputs = [
			"lab",
			"https://account.r2.cloudflarestorage.com",
			"archive",
			"custom-bucket",
			"custom-prefix",
			"custom-space",
		];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => selections.shift(),
			input: async () => inputs.shift(),
		});

		await mock.commands.get("sync")?.handler("", ctx);

		const saved = await readLocalConfigObject();
		const target = (saved?.targets as Record<string, Record<string, unknown>> | undefined)?.lab;
		assert.equal(saved?.activeTarget, "lab");
		assert.ok(
			Object.hasOwn(
				(saved?.profiles as Record<string, Record<string, unknown>> | undefined) ?? {},
				"archive",
			),
		);
		assert.equal(target?.profile, "archive");
		assert.equal(target?.bucket, "custom-bucket");
		assert.equal(target?.prefix, "custom-prefix");
		assert.equal(target?.namespace, "custom-space");
	});
});

test("cancelling first-time setup creates no settings or state", async () => {
	await withTempSettings(async (agentDir) => {
		const mock = createMockPi();
		sync(mock.pi);
		const selections = ["Set up sync", undefined];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => selections.shift(),
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.equal(await readLocalConfigObject(), undefined);
		assert.equal(existsSync(path.join(agentDir, ".pisync")), false);
	});
});

test("manage flow recommends the current profile bucket and derives a separate namespace", async () => {
	await withTempSettings(async () => {
		writeSettings(v2Settings());
		const mock = createMockPi();
		sync(mock.pi);
		const selections = [
			"Manage targets & storage",
			"Add sync target",
			"r2",
			"Same bucket as “home” (recommended)",
			"Recommended Pi settings",
			"Add target",
			undefined,
		];
		const inputs = ["work"];
		const rendered: string[] = [];
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				rendered.push(title);
				return selections.shift();
			},
			input: async () => inputs.shift(),
		});

		await mock.commands.get("sync")?.handler("", ctx);

		const saved = await readLocalConfigObject();
		const work = (saved?.targets as Record<string, Record<string, unknown>> | undefined)?.work;
		assert.equal(saved?.activeTarget, "home");
		assert.equal(work?.profile, "r2");
		assert.equal(work?.bucket, "personal-pi");
		assert.equal(work?.prefix, "pi-sync");
		assert.equal(work?.namespace, "work");
		assert.match(rendered.join("\n"), /personal-pi.*pi-sync\/profiles\/work/s);
		assert.match(notifications.at(-1)?.message ?? "", /Added sync target “work”/);
	});
});

test("synced-content UI fits narrow and wide terminal widths with textual state", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.activeTarget = "家庭與工作設定";
		settings.targets[settings.activeTarget] = settings.targets.home ?? {};
		delete settings.targets.home;
		writeSettings(settings);
		const mock = createMockPi();
		sync(mock.pi);
		const rendered = new Map<number, string[]>();
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				for (const width of [32, 60, 100]) {
					const selector = createCustomSelectorHarness(factory, width);
					rendered.set(width, selector.render());
				}
				const selector = createCustomSelectorHarness(factory, 60);
				selector.handleInput("\u001b");
				return selector.result;
			},
		});

		await mock.commands.get("sync")?.handler("files", ctx);

		for (const [width, lines] of rendered) {
			assert.ok(lines.length > 0);
			assert.ok(lines.every((line) => visibleWidth(line) <= width));
			assert.match(lines.join("\n"), /included|excluded/);
		}
	});
});

test("TUI history selects a snapshot, previews concrete rollback, and cancellation is read-only", async () => {
	await withTempSettings(async (agentDir) => {
		writeSettings(v2Settings());
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(path.join(agentDir, "settings.json"), '{"local":true}\n');
		const remoteSnapshot = snapshotPayload("remote-snapshot", '{"remote":true}\n');
		const encoded = gzipSync(Buffer.from(JSON.stringify(remoteSnapshot)));
		const pointer = {
			version: 1,
			profile: "home",
			snapshot: remoteSnapshot.id,
			sha256: createHash("sha256").update(encoded).digest("hex"),
			createdAt: remoteSnapshot.createdAt,
			machine: "remote-machine",
		};
		const originalFetch = globalThis.fetch;
		let putCalls = 0;
		globalThis.fetch = (async (input, init) => {
			const url = new URL(String(input));
			if (init?.method === "PUT") {
				putCalls += 1;
				return new Response(null, { status: 200 });
			}
			if (url.pathname.endsWith("/history.json")) {
				return Response.json({ version: 1, snapshots: [pointer] });
			}
			if (url.pathname.endsWith(`/snapshots/${remoteSnapshot.id}.json.gz`)) {
				return new Response(new Uint8Array(encoded));
			}
			throw new Error(`Unexpected request: ${url.pathname}`);
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			let historyTitle = "";
			let confirmMessage = "";
			const { ctx } = createMockContext({
				hasUI: true,
				mode: "tui",
				select: async (title: string, options: string[]) => {
					historyTitle = title;
					return options[0];
				},
				confirm: async (_title: string, message: string) => {
					confirmMessage = message;
					return false;
				},
			});

			await mock.commands.get("sync")?.handler("history", ctx);

			assert.match(historyTitle, /History for target “home”/);
			assert.match(confirmMessage, /Snapshot: remote-snapshot/);
			assert.match(confirmMessage, /Update locally: settings\.json/);
			assert.equal(putCalls, 0);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("Sync now reports nothing selected without network or state mutation", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targets.home.syncFiles = [];
		settings.targets.home.extraFiles = [];
		settings.targets.home.syncSessions = false;
		writeSettings(settings);
		const originalFetch = globalThis.fetch;
		let requests = 0;
		globalThis.fetch = (async () => {
			requests += 1;
			throw new Error("Nothing-selected sync must not use the network");
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx, notifications } = createMockContext({ hasUI: true });

			await mock.commands.get("sync")?.handler("sync", ctx);

			assert.equal(requests, 0);
			assert.match(notifications.at(-1)?.message ?? "", /manages no files/);
			assert.equal(existsSync(path.join(stateDir(), "targets")), false);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("manual target operation addresses a non-current target without switching", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		writeSettings(settings);
		const originalFetch = globalThis.fetch;
		let requestedPath = "";
		globalThis.fetch = (async (input) => {
			requestedPath = new URL(String(input)).pathname;
			return new Response(null, { status: 404 });
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx } = createMockContext({ hasUI: true });

			await mock.commands.get("sync")?.handler("status --target work", ctx);

			assert.match(requestedPath, /\/profiles\/work\/latest\.json$/);
			assert.equal((await readLocalConfigObject())?.activeTarget, "home");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("direct use switches targets and target options parse exactly", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		writeSettings(settings);
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext();

		await mock.commands.get("sync")?.handler("use work", ctx);

		assert.equal((await readLocalConfigObject())?.activeTarget, "work");
		assert.match(notifications.at(-1)?.message ?? "", /confirmation requires TUI mode/);
		assert.equal(parseOptions(["--target", "home"]).target, "home");
		assert.throws(() => parseOptions(["--target"]), /requires a target name/);
		assert.throws(() => parseOptions(["--unknown"]), /Unknown sync option/);
	});
});

test("invalid target-switch actions fail settings validation", async () => {
	await withTempSettings(async () => {
		writeSettings({ ...v2Settings(), targetSwitchAction: "sometimes" });
		await assert.rejects(
			loadConfig(),
			/targetSwitchAction must be "ask", "pull", or "switch-only"/,
		);
	});
});

test("duplicate target remote identities fail validation", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targets.work = { ...settings.targets.home };
		writeSettings(settings);
		await assert.rejects(loadConfig(), /targets "home" and "work" use the same remote destination/);
	});
});

test("deprecated namespace overrides cannot collapse distinct targets onto one destination", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		writeSettings(settings);
		process.env.PI_SYNC_PROFILE = "forced-namespace";

		await assert.rejects(loadConfig(), /targets "home" and "work" use the same remote destination/);
	});
});

test("legacy migration preserves unknown fields, exact backup bytes, remote identity, and state", async () => {
	await withTempSettings(async () => {
		const original = `${JSON.stringify(
			{
				endpoint: "https://legacy.r2.cloudflarestorage.com",
				bucket: "legacy-bucket",
				region: "auto",
				accessKeyId: "legacy-access",
				secretAccessKey: "legacy-secret",
				profile: "legacy-space",
				prefix: "legacy-prefix",
				autoSync: false,
				syncFiles: ["settings.json"],
				syncSessions: false,
				extraFiles: ["LOCAL.md"],
				future: { retained: true },
			},
			null,
			"\t",
		)}\n`;
		mkdirSync(path.dirname(localConfigPath()), { recursive: true });
		writeFileSync(localConfigPath(), original);
		const legacy = await loadConfig();
		await writeStateForConfig(legacy, {
			version: 1,
			profile: legacy.profile,
			lastAppliedSnapshot: "legacy-snapshot",
			lastFileHashes: { "settings.json": "hash" },
		});

		const result = await migrateLegacySettings("home", "r2");
		const saved = await readLocalConfigObject();

		assert.equal(readFileSync(result.backupPath, "utf8"), original);
		assert.deepEqual(saved?.future, { retained: true });
		assert.equal(saved?.activeTarget, "home");
		assert.equal(
			(saved?.profiles as Record<string, Record<string, unknown>> | undefined)?.r2?.endpoint,
			"https://legacy.r2.cloudflarestorage.com",
		);
		assert.equal(
			(saved?.targets as Record<string, Record<string, unknown>> | undefined)?.home?.namespace,
			"legacy-space",
		);
		assert.equal(Object.hasOwn(saved ?? {}, "secretAccessKey"), false);
		const migrated = await loadConfig();
		assert.equal(migrated.profile, "legacy-space");
		assert.equal((await readStateForConfig(migrated)).lastAppliedSnapshot, "legacy-snapshot");
	});
});

test("startup recovery restores an interrupted local snapshot transaction", async () => {
	await withTempSettings(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const target = path.join(agentDir, "settings.json");
		writeFileSync(target, '{"partial":true}\n');
		const transaction = path.join(stateDir(), "transactions", "interrupted");
		mkdirSync(path.join(transaction, "before"), { recursive: true });
		writeFileSync(path.join(transaction, "before", "0"), '{"old":true}\n');
		writeFileSync(
			path.join(transaction, "journal.json"),
			JSON.stringify({
				version: 1,
				root: agentDir,
				entries: [{ target, backupName: "0", kind: "file" }],
			}),
		);

		await recoverPendingSnapshotTransactions();

		assert.equal(readFileSync(target, "utf8"), '{"old":true}\n');
		assert.equal(existsSync(transaction), false);
	});
});

test("automatic sync consults only the current target", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targets.home.autoSync = false;
		settings.targets.work = { ...settings.targets.home, namespace: "work", autoSync: true };
		writeSettings(settings);
		const originalFetch = globalThis.fetch;
		let requests = 0;
		globalThis.fetch = (async () => {
			requests += 1;
			throw new Error("Non-current target should not auto-sync");
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx } = createMockContext();
			await mock.events.get("session_start")?.[0]?.({}, ctx);
			assert.equal(requests, 0);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("v2 targets keep independent local sync state even when namespaces match", async () => {
	await withTempSettings(async () => {
		const settings = v2Settings();
		settings.targets.work = {
			...settings.targets.home,
			bucket: "work-bucket",
			namespace: "home",
		};
		writeSettings(settings);
		const home = await loadConfig("home");
		const work = await loadConfig("work");

		await writeStateForConfig(home, {
			version: 1,
			profile: home.profile,
			lastAppliedSnapshot: "home-snapshot",
			lastFileHashes: {},
		});
		await writeStateForConfig(work, {
			version: 1,
			profile: work.profile,
			lastAppliedSnapshot: "work-snapshot",
			lastFileHashes: {},
		});

		assert.equal((await readStateForConfig(home)).lastAppliedSnapshot, "home-snapshot");
		assert.equal((await readStateForConfig(work)).lastAppliedSnapshot, "work-snapshot");
	});
});

test("flat v1 settings retain their remote namespace and defaults", async () => {
	await withTempSettings(async () => {
		writeSettings({
			endpoint: "https://legacy.example.com",
			bucket: "legacy-bucket",
			region: "legacy-region",
			accessKeyId: "legacy-access",
			secretAccessKey: "legacy-secret",
			profile: "legacy-space",
			prefix: "legacy-prefix",
			autoSync: false,
		});

		const config = await loadConfig();
		assert.equal(config.target, "default");
		assert.equal(config.storageProfile, "default");
		assert.equal(config.profile, "legacy-space");
		assert.equal(config.autoSync, false);
	});
});

function snapshotPayload(id: string, settings: string) {
	const content = Buffer.from(settings);
	return {
		version: 1,
		id,
		createdAt: "2026-07-24T00:00:00.000Z",
		machine: "remote-machine",
		profile: "home",
		syncSessions: false,
		files: [
			{
				path: "settings.json",
				contentBase64: content.toString("base64"),
				sha256: createHash("sha256").update(content).digest("hex"),
			},
		],
	};
}

function v2Settings(): {
	version: 2;
	activeTarget: string;
	targetSwitchAction?: "ask" | "pull" | "switch-only";
	profiles: Record<string, Record<string, unknown>>;
	targets: Record<string, Record<string, unknown>>;
	future?: Record<string, unknown>;
} {
	return {
		version: 2,
		activeTarget: "home",
		profiles: {
			r2: {
				endpoint: "https://account.r2.cloudflarestorage.com",
				region: "auto",
				accessKeyId: "r2-access",
				secretAccessKey: "r2-secret",
			},
		},
		targets: {
			home: {
				profile: "r2",
				bucket: "personal-pi",
				namespace: "home",
				prefix: "pi-sync",
				autoSync: true,
				syncFiles: ["settings.json"],
				syncSessions: false,
				extraFiles: [],
			},
		},
	};
}

async function withTempSettings(fn: (agentDir: string) => Promise<void>) {
	const previous = new Map<string, string | undefined>(
		ENV_KEYS.map((key) => [key, process.env[key]]),
	);
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-sync-profile-test-"));
	const agentDir = path.join(root, "agent");
	for (const key of ENV_KEYS) delete process.env[key];
	process.env.PI_CODING_AGENT_DIR = agentDir;
	try {
		await fn(agentDir);
	} finally {
		for (const key of ENV_KEYS) {
			const value = previous.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		rmSync(root, { recursive: true, force: true });
	}
}

function writeSettings(value: unknown) {
	mkdirSync(path.dirname(localConfigPath()), { recursive: true });
	writeFileSync(localConfigPath(), `${JSON.stringify(value, null, "\t")}\n`);
}
