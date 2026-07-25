export type StorageProfileKind = "r2" | "s3-compatible";
export type TargetSwitchAction = "ask" | "pull" | "switch-only";

export interface StorageProfileSettings {
	kind?: StorageProfileKind;
	endpoint?: string;
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	sessionToken?: string;
}

export interface SyncTargetSettings {
	profile?: string;
	bucket?: string;
	prefix?: string;
	namespace?: string;
	autoSync?: boolean;
	syncFiles?: unknown;
	syncSessions?: boolean;
	extraFiles?: unknown;
}

export interface PiSyncSettingsV2 {
	version: 2;
	activeTarget?: string;
	targetSwitchAction?: TargetSwitchAction;
	profiles?: Record<string, StorageProfileSettings>;
	targets?: Record<string, SyncTargetSettings>;
	[key: string]: unknown;
}

export interface SyncConfig {
	endpoint: string;
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	/** Remote namespace retained as `profile` for snapshot/wire compatibility. */
	profile: string;
	prefix: string;
	target?: string;
	storageProfile?: string;
	storageKind?: StorageProfileKind;
	autoSync?: boolean;
	settingsVersion?: 1 | 2;
	syncFiles?: string[];
	syncSessions: boolean;
	extraFiles: string[];
}

export interface PartialConfig {
	target?: string;
	storageProfile?: string;
	storageKind?: StorageProfileKind;
	settingsVersion?: 1 | 2;
	endpoint?: string;
	bucket?: string;
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	sessionToken?: string;
	profile?: string;
	prefix?: string;
	autoSync?: boolean | string;
	syncFiles?: unknown;
	syncSessions?: boolean | string;
	extraFiles?: unknown;
}

export interface SnapshotFile {
	path: string;
	contentBase64: string;
	sha256: string;
}

export interface Snapshot {
	version: number;
	id: string;
	createdAt: string;
	machine: string;
	profile: string;
	syncSessions?: boolean;
	files: SnapshotFile[];
}

export interface LatestPointer {
	version: number;
	profile: string;
	snapshot: string;
	sha256: string;
	createdAt: string;
	machine: string;
	syncSessions?: boolean;
}

export interface RemoteObject<T> {
	value?: T;
	etag?: string;
	missing: boolean;
}

export interface SyncState {
	version: number;
	profile: string;
	lastAppliedSnapshot?: string;
	lastRemoteEtag?: string;
	lastFileHashes: Record<string, string>;
	syncFiles?: string[];
	syncSessions?: boolean;
	extraFiles?: string[];
}

export interface LockFile {
	id: string;
	pid: number;
	command: string;
	startedAt: string;
}

export interface CommandOptions {
	yes: boolean;
	force: boolean;
	stale: boolean;
	silent: boolean;
	reload: boolean;
	auto: boolean;
	target?: string;
	signal?: AbortSignal;
	onCommit?: () => void;
	args: string[];
}

export interface CommandArgumentCompletion {
	value: string;
	label: string;
	description?: string;
}

export interface SnapshotOptions {
	syncFiles?: string[];
	syncSessions?: boolean;
	sessionDir?: string;
	extraFiles?: string[];
}

export interface SnapshotApplyPlan {
	writes: Array<{ target: string; content: Buffer }>;
	deletes: string[];
}
