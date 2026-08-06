import { rmSync } from "node:fs";
import path from "node:path";
import { GitSyncBackend } from "../src/git-backend.js";
import { registerSyncBackendContractSuite } from "./backend-contract-suite.js";
import { createBareRemote, gitConfig } from "./git-test-helpers.js";

registerSyncBackendContractSuite("git", () => {
	const fixture = createBareRemote();
	return {
		backend: new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "cache"),
			allowLocalRemotes: true,
		}),
		dispose: () => rmSync(fixture.root, { recursive: true, force: true }),
	};
});
