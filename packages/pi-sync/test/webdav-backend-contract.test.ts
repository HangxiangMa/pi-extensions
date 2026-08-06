import { WebDavSyncBackend } from "../src/webdav-backend.js";
import { registerSyncBackendContractSuite } from "./backend-contract-suite.js";
import { MockWebDavServer, webDavConfig } from "./mock-webdav-server.js";

registerSyncBackendContractSuite("webdav", async () => {
	const server = await new MockWebDavServer().start();
	return {
		backend: new WebDavSyncBackend(webDavConfig(server.url)),
		dispose: () => server.close(),
	};
});
