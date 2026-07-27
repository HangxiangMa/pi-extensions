import { GitSyncBackend } from "./git-backend.js";
import { S3SyncBackend } from "./s3-backend.js";
import type { SyncBackend } from "./sync-backend.js";
import type { AnySyncConfig } from "./types.js";
import { WebDavSyncBackend } from "./webdav-backend.js";

export type SyncBackendFactory = {
	bivarianceHack(config: AnySyncConfig): SyncBackend;
}["bivarianceHack"];

export const createSyncBackend: SyncBackendFactory = (config) => {
	switch (config.backend.type) {
		case "s3":
			return new S3SyncBackend(config.backend);
		case "webdav":
			return new WebDavSyncBackend(config.backend);
		case "git":
			return new GitSyncBackend(config.backend);
	}
};
