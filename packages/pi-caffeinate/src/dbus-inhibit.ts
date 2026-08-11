import { type Message, type MessageBus, sessionBus } from "dbus-native";

export const SCREENSAVER_BUS_NAME = "org.freedesktop.ScreenSaver";
export const SCREENSAVER_INTERFACE = "org.freedesktop.ScreenSaver";
export const INHIBIT_REASON = "Pi agent is running";

const INHIBIT_APPLICATION_NAME = "pi-caffeinate";
const SCREENSAVER_OBJECT_PATHS = ["/org/freedesktop/ScreenSaver", "/ScreenSaver"];

export interface DbusScreenSaverClient {
	inhibit(reason: string): Promise<void>;
	uninhibit(): Promise<void>;
	close(): Promise<void>;
}

export type DbusScreenSaverFactory = () => Promise<DbusScreenSaverClient>;

export async function defaultDbusScreenSaverFactory(): Promise<DbusScreenSaverClient> {
	return new NativeScreenSaverClient(sessionBus());
}

class NativeScreenSaverClient implements DbusScreenSaverClient {
	private cookie?: number;
	private objectPath?: string;

	constructor(private readonly bus: MessageBus) {}

	async inhibit(reason: string): Promise<void> {
		let lastError: unknown;
		for (const objectPath of SCREENSAVER_OBJECT_PATHS) {
			try {
				this.cookie = await invoke<number>(this.bus, {
					destination: SCREENSAVER_BUS_NAME,
					path: objectPath,
					interface: SCREENSAVER_INTERFACE,
					member: "Inhibit",
					signature: "ss",
					body: [INHIBIT_APPLICATION_NAME, reason],
				});
				this.objectPath = objectPath;
				return;
			} catch (error) {
				lastError = error;
			}
		}
		throw new Error(`D-Bus idle inhibit failed: ${formatError(lastError)}`, {
			cause: lastError,
		});
	}

	async uninhibit(): Promise<void> {
		if (this.cookie === undefined || !this.objectPath) return;
		const cookie = this.cookie;
		this.cookie = undefined;
		await invoke<void>(this.bus, {
			destination: SCREENSAVER_BUS_NAME,
			path: this.objectPath,
			interface: SCREENSAVER_INTERFACE,
			member: "UnInhibit",
			signature: "u",
			body: [cookie],
		});
	}

	async close(): Promise<void> {
		await this.bus.close();
	}
}

function invoke<TResult>(bus: MessageBus, message: Message): Promise<TResult> {
	return new Promise<TResult>((resolve, reject) => {
		bus.invoke(message, (error, ...values) => {
			if (error) reject(error);
			else resolve(values[0] as TResult);
		});
	});
}

function formatError(error: unknown) {
	if (error instanceof Error) {
		return error.name === "Error" ? error.message : `${error.name}: ${error.message}`;
	}
	return String(error);
}
