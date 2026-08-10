import * as fs from "node:fs";
import * as path from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { WorkItemLedger, type WorkItemLedgerSnapshot } from "./work-item-ledger.js";

export class WorkItemPersistence {
	constructor(readonly filePath: string) {}

	async save(snapshot: WorkItemLedgerSnapshot): Promise<void> {
		const filePath = path.resolve(this.filePath);
		await withFileMutationQueue(filePath, async () => {
			await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
			const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
			try {
				await fs.promises.writeFile(temporary, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
				await fs.promises.rename(temporary, filePath);
			} finally {
				await fs.promises.rm(temporary, { force: true });
			}
		});
	}

	load(): WorkItemLedger | undefined {
		const filePath = path.resolve(this.filePath);
		let source: string;
		try {
			source = fs.readFileSync(filePath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
		try {
			return WorkItemLedger.restore(JSON.parse(source) as WorkItemLedgerSnapshot);
		} catch {
			const quarantine = `${filePath}.invalid-${Date.now()}`;
			try {
				fs.renameSync(filePath, quarantine);
			} catch {
				// A concurrent owner may already have handled the invalid file.
			}
			return undefined;
		}
	}
}
