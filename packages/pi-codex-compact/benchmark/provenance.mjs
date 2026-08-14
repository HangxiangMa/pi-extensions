import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PI_PACKAGES = Object.freeze([
	"@earendil-works/pi-agent-core",
	"@earendil-works/pi-ai",
	"@earendil-works/pi-coding-agent",
]);

async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, "utf8"));
}

async function gitValue(repoRoot, args) {
	try {
		const { stdout } = await execFileAsync("git", args, {
			cwd: repoRoot,
			encoding: "utf8",
			timeout: 10_000,
		});
		return stdout.trim();
	} catch {
		return undefined;
	}
}

export async function collectRuntimeProvenance(packageRoot, protocolPath) {
	const repoRoot = path.resolve(packageRoot, "../..");
	const extensionManifest = await readJson(path.join(packageRoot, "package.json"));
	const piPackageVersions = {};
	for (const packageName of PI_PACKAGES) {
		const manifest = await readJson(
			path.join(repoRoot, "node_modules", packageName, "package.json"),
		);
		piPackageVersions[packageName] = manifest.version;
	}
	const sourceRevision = await gitValue(repoRoot, ["rev-parse", "HEAD"]);
	const trackedChanges = await gitValue(repoRoot, [
		"status",
		"--porcelain",
		"--untracked-files=no",
		"--",
		"packages/pi-codex-compact/benchmark",
		"packages/pi-codex-compact/src",
		"packages/pi-codex-compact/package.json",
		"package-lock.json",
	]);
	let protocolManifestTrackedAtSourceRevision;
	if (protocolPath) {
		const relativeProtocolPath = path.relative(repoRoot, path.resolve(protocolPath));
		const insideRepository =
			relativeProtocolPath !== "" &&
			!relativeProtocolPath.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relativeProtocolPath);
		if (!insideRepository) protocolManifestTrackedAtSourceRevision = false;
		else {
			const tracked = await gitValue(repoRoot, [
				"ls-files",
				"--error-unmatch",
				"--",
				relativeProtocolPath,
			]);
			const unchanged = await gitValue(repoRoot, [
				"diff",
				"--quiet",
				"HEAD",
				"--",
				relativeProtocolPath,
			]);
			protocolManifestTrackedAtSourceRevision = tracked !== undefined && unchanged !== undefined;
		}
	}
	return {
		nodeVersion: process.version,
		extensionPackage: {
			name: extensionManifest.name,
			version: extensionManifest.version,
		},
		piPackageVersions,
		estimator: {
			package: "@earendil-works/pi-coding-agent",
			export: "estimateTokens",
		},
		...(sourceRevision ? { sourceRevision } : {}),
		trackedBenchmarkChangesPresent:
			trackedChanges === undefined ? undefined : trackedChanges !== "",
		...(protocolPath ? { protocolManifestTrackedAtSourceRevision } : {}),
		provenanceLimit:
			"The hosted model may change under the same ID; provenance identifies the local harness, not a provider-side model revision.",
	};
}
