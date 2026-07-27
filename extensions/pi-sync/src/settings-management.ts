import {
	effectiveSyncSetupRemoteIdentity,
	localConfigPath,
	updateLocalConfig,
	validateConfigName,
} from "./config.js";
import type { PiSyncSettingsV3, StorageConnectionSettings, SyncSetupSettings } from "./types.js";

export async function saveNewV3Settings(input: {
	setupName: string;
	connectionName: string;
	connection: StorageConnectionSettings;
	setup: SyncSetupSettings;
}) {
	validateConfigName(input.setupName, "sync setup");
	validateConfigName(input.connectionName, "storage connection");
	const settings: PiSyncSettingsV3 = {
		version: 3,
		activeSyncSetup: input.setupName,
		onSwitch: "ask-before-pull",
		storageConnections: { [input.connectionName]: structuredClone(input.connection) },
		syncSetups: {
			[input.setupName]: {
				...structuredClone(input.setup),
				storage: { ...input.setup.storage, connection: input.connectionName },
			},
		},
	};
	await updateLocalConfig((current) => {
		if (Object.keys(current.storageConnections).length || Object.keys(current.syncSetups).length) {
			throw new Error(`Settings already exist: ${localConfigPath()}`);
		}
		return settings;
	});
	return settings;
}

export async function addStorageConnection(name: string, connection: StorageConnectionSettings) {
	validateConfigName(name, "storage connection");
	await updateSettings((settings) => {
		if (Object.hasOwn(settings.storageConnections, name)) {
			throw new Error(`Storage connection already exists: ${name}`);
		}
		return {
			...settings,
			storageConnections: {
				...settings.storageConnections,
				[name]: structuredClone(connection),
			},
		};
	});
}

export async function updateStorageConnection(
	name: string,
	update: (connection: StorageConnectionSettings) => StorageConnectionSettings,
	expectedSetups?: readonly string[],
) {
	validateConfigName(name, "storage connection");
	await updateSettings((settings) => {
		const connection = settings.storageConnections[name];
		if (!connection) throw new Error(`Storage connection not found: ${name}`);
		const currentSetups = referencingSetupNames(settings.syncSetups, name);
		if (expectedSetups && !sameNames(currentSetups, expectedSetups)) {
			throw new Error(
				`Storage connection “${name}” usage changed while it was open; reopen it and review the affected sync setups.`,
			);
		}
		const nextConnection = update(structuredClone(connection));
		const nextConnections = { ...settings.storageConnections, [name]: nextConnection };
		assertUniqueLocations(settings.syncSetups, nextConnections);
		return { ...settings, storageConnections: nextConnections };
	});
}

export async function addSyncSetup(name: string, setup: SyncSetupSettings) {
	validateConfigName(name, "sync setup");
	await updateSettings((settings) => {
		if (Object.hasOwn(settings.syncSetups, name))
			throw new Error(`Sync setup already exists: ${name}`);
		if (!Object.hasOwn(settings.storageConnections, setup.storage.connection)) {
			throw new Error(`Storage connection not found: ${setup.storage.connection}`);
		}
		const nextSetups = { ...settings.syncSetups, [name]: structuredClone(setup) };
		assertUniqueLocations(nextSetups, settings.storageConnections);
		return {
			...settings,
			syncSetups: nextSetups,
			...(settings.activeSyncSetup ? {} : { activeSyncSetup: name }),
		};
	});
}

export async function updateSyncSetup(
	name: string,
	update: (setup: SyncSetupSettings) => SyncSetupSettings,
) {
	validateConfigName(name, "sync setup");
	await updateSettings((settings) => {
		const setup = settings.syncSetups[name];
		if (!setup) throw new Error(`Sync setup not found: ${name}`);
		const nextSetup = update(structuredClone(setup));
		if (!Object.hasOwn(settings.storageConnections, nextSetup.storage.connection)) {
			throw new Error(`Storage connection not found: ${nextSetup.storage.connection}`);
		}
		const nextSetups = { ...settings.syncSetups, [name]: nextSetup };
		assertUniqueLocations(nextSetups, settings.storageConnections);
		return { ...settings, syncSetups: nextSetups };
	});
}

export async function removeSyncSetup(name: string) {
	validateConfigName(name, "sync setup");
	await updateSettings((settings) => {
		if (!Object.hasOwn(settings.syncSetups, name)) throw new Error(`Sync setup not found: ${name}`);
		if (settings.activeSyncSetup === name) {
			throw new Error("Switch to another sync setup before removing the current setup.");
		}
		const syncSetups = { ...settings.syncSetups };
		delete syncSetups[name];
		return { ...settings, syncSetups };
	});
}

export async function removeStorageConnection(name: string) {
	validateConfigName(name, "storage connection");
	await updateSettings((settings) => {
		const referenced = referencingSetupNames(settings.syncSetups, name)[0];
		if (referenced) {
			throw new Error(`Storage connection “${name}” is used by sync setup “${referenced}”.`);
		}
		if (!Object.hasOwn(settings.storageConnections, name)) {
			throw new Error(`Storage connection not found: ${name}`);
		}
		const storageConnections = { ...settings.storageConnections };
		delete storageConnections[name];
		return { ...settings, storageConnections };
	});
}

async function updateSettings(update: (settings: PiSyncSettingsV3) => PiSyncSettingsV3) {
	return updateLocalConfig((settings) => {
		if (settings.version !== 3) {
			throw new Error("Storage connections and sync setups require version 3 pi-sync settings.");
		}
		return update(settings);
	});
}

function referencingSetupNames(setups: Record<string, SyncSetupSettings>, connection: string) {
	return Object.entries(setups)
		.filter(([, setup]) => setup.storage.connection === connection)
		.map(([name]) => name)
		.sort((left, right) => left.localeCompare(right));
}

function assertUniqueLocations(
	setups: Record<string, SyncSetupSettings>,
	connections: Record<string, StorageConnectionSettings>,
) {
	const identities = new Map<string, string>();
	for (const [name, setup] of Object.entries(setups)) {
		const connection = connections[setup.storage.connection];
		if (!connection) throw new Error(`Storage connection not found: ${setup.storage.connection}`);
		const identity = effectiveSyncSetupRemoteIdentity(setup, connection);
		const previous = identities.get(identity);
		if (previous) {
			throw new Error(`Sync setup “${name}” duplicates the storage location of “${previous}”.`);
		}
		identities.set(identity, name);
	}
}

function sameNames(left: readonly string[], right: readonly string[]) {
	return left.length === right.length && left.every((name, index) => name === right[index]);
}
