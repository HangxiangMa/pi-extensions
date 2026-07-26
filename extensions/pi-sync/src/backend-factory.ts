import { S3SyncBackend } from "./s3-backend.js";
import type { SyncBackend } from "./sync-backend.js";
import type { SyncConfig } from "./types.js";

export type SyncBackendFactory = (config: SyncConfig) => SyncBackend;

export const createSyncBackend: SyncBackendFactory = (config) => {
	switch (config.backend.type) {
		case "s3":
			return new S3SyncBackend(config.backend);
	}
};
