import {
	type ManagedIntegrationCandidate,
	type ManagedIntegrationExpectation,
	verifyManagedIntegration,
} from "./integration-controller.js";

export const WORK_ITEM_LEDGER_VERSION = "pi-subagents:work-ledger:v1" as const;

export type WorkItemState =
	| "pending"
	| "ready"
	| "running"
	| "blocked"
	| "needs-input"
	| "completed"
	| "failed"
	| "interrupted"
	| "stale"
	| "invalidated";

export interface WorkArtifactReference {
	id: string;
	kind: string;
	version: string;
	digest?: string;
	producerTaskId?: string;
	generation?: number;
	verified?: boolean;
}

export interface WorkItemDefinition {
	id: string;
	objective: string;
	dependencies: string[];
	inputArtifacts?: string[];
	inputArtifactVersions?: Record<string, string>;
	requiredCapabilities?: string[];
	requiredTools?: string[];
	selectedAgentName?: string;
	sideEffectPolicy?: "read-only" | "idempotent" | "mutating";
	readPaths?: string[];
	writePaths?: string[];
	ownershipKeys?: string[];
	acceptanceCriteria?: string[];
	integrationOwner?: boolean;
	verifierFor?: string;
	dependencyPolicy?: "completed" | "settled";
}

export interface WorkItemRecord {
	id: string;
	objective: string;
	dependencies: string[];
	dependents: string[];
	state: WorkItemState;
	generation: number;
	taskGeneration: number;
	assignedAgentId?: string;
	acceptedExecutionPlanId?: string;
	inputArtifacts: string[];
	inputArtifactVersions: Record<string, string>;
	requiredArtifactVersions: Record<string, string>;
	requiredCapabilities: string[];
	requiredTools: string[];
	selectedAgentName?: string;
	sideEffectPolicy: "read-only" | "idempotent" | "mutating";
	artifacts: WorkArtifactReference[];
	artifactHistory: WorkArtifactReference[];
	readPaths: string[];
	writePaths: string[];
	ownershipKeys: string[];
	acceptanceCriteria: string[];
	integrationOwner: boolean;
	verifierFor?: string;
	dependencyPolicy: "completed" | "settled";
	verificationAccepted: boolean;
	invalidationReasons: string[];
	outcomeReason?: string;
}

export interface WorkItemLedgerSnapshot {
	version: typeof WORK_ITEM_LEDGER_VERSION;
	workflowId: string;
	generation: number;
	items: WorkItemRecord[];
}

export interface CreateWorkItemLedgerInput {
	workflowId: string;
	items: WorkItemDefinition[];
}

export interface CompleteWorkItemInput {
	taskGeneration: number;
	executionPlanId?: string;
	artifacts?: Array<Omit<WorkArtifactReference, "producerTaskId" | "generation">>;
	verificationAccepted?: boolean;
}

const MAX_ITEMS = 64;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_TEXT_LENGTH = 16 * 1024;
const MAX_LIST_ITEMS = 50;

const TERMINAL_STATES = new Set<WorkItemState>([
	"completed",
	"failed",
	"interrupted",
	"stale",
	"invalidated",
]);

export class WorkItemLedger {
	private readonly items = new Map<string, WorkItemRecord>();
	private generation = 0;

	private constructor(readonly workflowId: string) {}

	static create(input: CreateWorkItemLedgerInput): WorkItemLedger {
		validateIdentifier(input.workflowId, "workflowId");
		if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_ITEMS) {
			throw new Error(`WorkItem workflow must contain 1-${MAX_ITEMS} items`);
		}
		const ledger = new WorkItemLedger(input.workflowId);
		for (const definition of input.items) ledger.addDefinition(definition);
		ledger.linkAndValidate();
		ledger.refreshReadyState();
		return ledger;
	}

	get(id: string): WorkItemRecord | undefined {
		const item = this.items.get(id);
		return item ? structuredClone(item) : undefined;
	}

	readyItems(): WorkItemRecord[] {
		this.refreshReadyState();
		return [...this.items.values()]
			.filter((item) => item.state === "ready")
			.sort((left, right) => left.id.localeCompare(right.id))
			.map((item) => structuredClone(item));
	}

	start(id: string, agentId: string): WorkItemRecord {
		const item = this.require(id);
		if (item.state !== "ready") {
			throw new Error(`WorkItem ${id} cannot start while ${item.state}`);
		}
		validateIdentifier(agentId, "agentId");
		item.state = "running";
		item.assignedAgentId = agentId;
		item.generation = ++this.generation;
		return structuredClone(item);
	}

	complete(id: string, input: CompleteWorkItemInput): WorkItemRecord {
		const item = this.require(id);
		this.assertMutable(item);
		if (item.state !== "running") {
			throw new Error(`WorkItem ${id} cannot complete while ${item.state}`);
		}
		if (input.taskGeneration !== item.taskGeneration) {
			throw new Error(`WorkItem ${id} rejected a stale task generation`);
		}
		item.acceptedExecutionPlanId = input.executionPlanId?.slice(0, 256);
		item.artifactHistory.push(...item.artifacts.map((artifact) => structuredClone(artifact)));
		item.artifacts = normalizeArtifacts(input.artifacts ?? [], id, this.generation + 1);
		item.verificationAccepted = input.verificationAccepted === true;
		item.state = "completed";
		item.generation = ++this.generation;
		if (item.verifierFor && item.verificationAccepted) {
			const verified = this.require(item.verifierFor);
			verified.verificationAccepted = true;
			verified.generation = this.generation;
		}
		this.refreshReadyState();
		return structuredClone(item);
	}

	settle(
		id: string,
		state: "blocked" | "needs-input" | "failed" | "interrupted",
		reason?: string,
	): WorkItemRecord {
		const item = this.require(id);
		this.assertMutable(item);
		if (item.state !== "running" && item.state !== "ready" && item.state !== "pending") {
			throw new Error(`WorkItem ${id} cannot settle while ${item.state}`);
		}
		item.state = state;
		item.outcomeReason = reason ? bounded(reason, MAX_TEXT_LENGTH) : undefined;
		item.generation = ++this.generation;
		this.refreshReadyState();
		return structuredClone(item);
	}

	acceptIntegration(
		id: string,
		expected: ManagedIntegrationExpectation,
		candidate: ManagedIntegrationCandidate,
	): WorkItemRecord {
		const item = this.require(id);
		if (!item.integrationOwner) {
			throw new Error(`WorkItem ${id} is not the integration owner`);
		}
		if (item.state !== "running") {
			throw new Error(`WorkItem ${id} cannot integrate while ${item.state}`);
		}
		if (expected.taskId !== id || expected.taskGeneration !== item.taskGeneration) {
			throw new Error(`WorkItem ${id} integration expectation has a stale generation`);
		}
		verifyManagedIntegration(expected, candidate);
		item.verificationAccepted = true;
		item.generation = ++this.generation;
		return structuredClone(item);
	}

	rerun(id: string): WorkItemRecord {
		const item = this.require(id);
		if (
			!["blocked", "needs-input", "failed", "interrupted", "stale", "invalidated"].includes(
				item.state,
			)
		) {
			throw new Error(`WorkItem ${id} cannot rerun while ${item.state}`);
		}
		item.state = "pending";
		item.taskGeneration++;
		item.assignedAgentId = undefined;
		item.acceptedExecutionPlanId = undefined;
		item.outcomeReason = undefined;
		item.verificationAccepted = false;
		item.generation = ++this.generation;
		this.refreshReadyState();
		return structuredClone(item);
	}

	invalidate(id: string, reason: string): WorkItemRecord[] {
		const root = this.require(id);
		const normalizedReason = bounded(reason, MAX_TEXT_LENGTH);
		if (!normalizedReason) throw new Error("WorkItem invalidation requires a reason");
		const affected: WorkItemRecord[] = [];
		const queue = [root.id];
		const seen = new Set<string>();
		while (queue.length > 0) {
			const currentId = queue.shift();
			if (!currentId || seen.has(currentId)) continue;
			seen.add(currentId);
			const item = this.require(currentId);
			item.state = currentId === root.id ? "stale" : "invalidated";
			item.taskGeneration++;
			item.invalidationReasons.push(`${root.id}:${normalizedReason}`);
			item.generation = ++this.generation;
			affected.push(structuredClone(item));
			queue.push(...item.dependents);
		}
		return affected;
	}

	snapshot(): WorkItemLedgerSnapshot {
		return {
			version: WORK_ITEM_LEDGER_VERSION,
			workflowId: this.workflowId,
			generation: this.generation,
			items: [...this.items.values()]
				.sort((left, right) => left.id.localeCompare(right.id))
				.map((item) => structuredClone(item)),
		};
	}

	static restore(snapshot: WorkItemLedgerSnapshot): WorkItemLedger {
		if (
			!snapshot ||
			snapshot.version !== WORK_ITEM_LEDGER_VERSION ||
			!Number.isSafeInteger(snapshot.generation) ||
			snapshot.generation < 0
		) {
			throw new Error("Unsupported or malformed WorkItem ledger snapshot");
		}
		if (
			!Array.isArray(snapshot.items) ||
			snapshot.items.length < 1 ||
			snapshot.items.length > MAX_ITEMS
		) {
			throw new Error("Malformed WorkItem ledger items");
		}
		for (const item of snapshot.items) validateStoredRecord(item, snapshot.generation);
		const ledger = WorkItemLedger.create({
			workflowId: snapshot.workflowId,
			items: snapshot.items.map((item) => ({
				id: item.id,
				objective: item.objective,
				dependencies: item.dependencies,
				inputArtifacts: item.inputArtifacts,
				inputArtifactVersions: item.requiredArtifactVersions,
				requiredCapabilities: item.requiredCapabilities,
				requiredTools: item.requiredTools,
				selectedAgentName: item.selectedAgentName,
				sideEffectPolicy: item.sideEffectPolicy,
				readPaths: item.readPaths,
				writePaths: item.writePaths,
				ownershipKeys: item.ownershipKeys,
				acceptanceCriteria: item.acceptanceCriteria,
				integrationOwner: item.integrationOwner,
				verifierFor: item.verifierFor,
				dependencyPolicy: item.dependencyPolicy,
			})),
		});
		ledger.generation = snapshot.generation;
		for (const stored of snapshot.items) {
			const item = ledger.require(stored.id);
			item.state = stored.state === "running" ? "interrupted" : stored.state;
			item.generation = stored.generation;
			item.taskGeneration = stored.taskGeneration ?? 1;
			item.assignedAgentId = stored.assignedAgentId;
			item.acceptedExecutionPlanId = stored.acceptedExecutionPlanId;
			item.inputArtifactVersions = { ...stored.inputArtifactVersions };
			item.artifacts = normalizeStoredArtifacts(stored.artifacts, stored.id, stored.generation);
			item.artifactHistory = normalizeStoredArtifacts(
				stored.artifactHistory ?? [],
				stored.id,
				stored.generation,
			);
			item.verificationAccepted = stored.verificationAccepted;
			item.invalidationReasons = [...stored.invalidationReasons];
			item.outcomeReason = stored.outcomeReason;
		}
		return ledger;
	}

	private addDefinition(definition: WorkItemDefinition): void {
		validateIdentifier(definition.id, "WorkItem id");
		if (this.items.has(definition.id)) throw new Error(`Duplicate WorkItem id ${definition.id}`);
		const objective = bounded(definition.objective, MAX_TEXT_LENGTH);
		if (!objective) throw new Error(`WorkItem ${definition.id} requires an objective`);
		this.items.set(definition.id, {
			id: definition.id,
			objective,
			dependencies: uniqueBounded(definition.dependencies, "dependency"),
			dependents: [],
			state: "pending",
			generation: 0,
			taskGeneration: 1,
			acceptedExecutionPlanId: undefined,
			inputArtifacts: uniqueBounded(definition.inputArtifacts ?? [], "input artifact"),
			inputArtifactVersions: {},
			requiredArtifactVersions: normalizeVersionMap(definition.inputArtifactVersions),
			requiredCapabilities: uniqueBounded(
				definition.requiredCapabilities ?? [],
				"required capability",
			),
			requiredTools: uniqueBounded(definition.requiredTools ?? [], "required tool"),
			selectedAgentName: definition.selectedAgentName,
			sideEffectPolicy: definition.sideEffectPolicy ?? "mutating",
			artifacts: [],
			artifactHistory: [],
			readPaths: uniqueBounded(definition.readPaths ?? [], "read path"),
			writePaths: uniqueBounded(definition.writePaths ?? [], "write path"),
			ownershipKeys: uniqueBounded(definition.ownershipKeys ?? [], "ownership key"),
			acceptanceCriteria: uniqueBounded(
				definition.acceptanceCriteria ?? [],
				"acceptance criterion",
			),
			integrationOwner: definition.integrationOwner === true,
			verifierFor: definition.verifierFor,
			dependencyPolicy: definition.dependencyPolicy ?? "completed",
			verificationAccepted: false,
			invalidationReasons: [],
		});
	}

	private linkAndValidate(): void {
		const integrationOwners = [...this.items.values()].filter((item) => item.integrationOwner);
		if (integrationOwners.length > 1)
			throw new Error("Workflow can have only one integration owner");
		for (const item of this.items.values()) {
			for (const dependency of item.dependencies) {
				if (dependency === item.id) throw new Error(`WorkItem ${item.id} has a self cycle`);
				const parent = this.items.get(dependency);
				if (!parent) throw new Error(`WorkItem ${item.id} has missing dependency ${dependency}`);
				parent.dependents.push(item.id);
			}
			if (item.verifierFor && !this.items.has(item.verifierFor)) {
				throw new Error(`WorkItem ${item.id} verifies missing WorkItem ${item.verifierFor}`);
			}
			if (item.verifierFor && !item.dependencies.includes(item.verifierFor)) {
				throw new Error(
					`WorkItem ${item.id} must depend on the WorkItem it verifies (${item.verifierFor})`,
				);
			}
		}
		const visiting = new Set<string>();
		const visited = new Set<string>();
		const visit = (id: string) => {
			if (visiting.has(id)) throw new Error(`WorkItem dependency cycle includes ${id}`);
			if (visited.has(id)) return;
			visiting.add(id);
			for (const dependency of this.require(id).dependencies) visit(dependency);
			visiting.delete(id);
			visited.add(id);
		};
		for (const id of this.items.keys()) visit(id);
	}

	private refreshReadyState(): void {
		for (const item of this.items.values()) {
			if (item.state !== "pending") continue;
			const dependencies = item.dependencies.map((id) => this.require(id));
			const dependenciesReady =
				item.dependencyPolicy === "settled"
					? dependencies.every(
							(dependency) => !["pending", "ready", "running"].includes(dependency.state),
						)
					: dependencies.every((dependency) => dependency.state === "completed");
			if (!dependenciesReady) continue;
			const available = new Map<string, WorkArtifactReference>();
			for (const dependency of dependencies) {
				for (const artifact of dependency.artifacts) available.set(artifact.id, artifact);
			}
			if (!item.inputArtifacts.every((artifact) => available.has(artifact))) continue;
			if (
				!Object.entries(item.requiredArtifactVersions).every(
					([id, version]) => available.get(id)?.version === version,
				)
			) {
				continue;
			}
			item.inputArtifactVersions = Object.fromEntries(
				item.inputArtifacts.map((id) => [id, available.get(id)?.version ?? "unknown"]),
			);
			item.state = "ready";
			item.generation = this.generation;
		}
	}

	private require(id: string): WorkItemRecord {
		const item = this.items.get(id);
		if (!item) throw new Error(`Unknown WorkItem ${id}`);
		return item;
	}

	private assertMutable(item: WorkItemRecord): void {
		if (TERMINAL_STATES.has(item.state)) {
			throw new Error(`WorkItem ${item.id} is terminal (${item.state})`);
		}
	}
}

function validateStoredRecord(item: WorkItemRecord, ledgerGeneration: number): void {
	const states: WorkItemState[] = [
		"pending",
		"ready",
		"running",
		"blocked",
		"needs-input",
		"completed",
		"failed",
		"interrupted",
		"stale",
		"invalidated",
	];
	if (
		!item ||
		typeof item !== "object" ||
		typeof item.objective !== "string" ||
		item.objective.length === 0 ||
		item.objective.length > MAX_TEXT_LENGTH ||
		item.objective.trim() !== item.objective ||
		!states.includes(item.state) ||
		!Number.isSafeInteger(item.generation) ||
		item.generation < 0 ||
		item.generation > ledgerGeneration ||
		!Number.isSafeInteger(item.taskGeneration) ||
		item.taskGeneration < 1 ||
		!Array.isArray(item.artifacts) ||
		!validStoredArtifacts(item.artifacts, item.id, item.generation) ||
		(item.artifactHistory !== undefined && !Array.isArray(item.artifactHistory)) ||
		(item.artifactHistory !== undefined &&
			!validStoredArtifacts(item.artifactHistory, item.id, item.generation)) ||
		!item.inputArtifactVersions ||
		typeof item.inputArtifactVersions !== "object" ||
		Array.isArray(item.inputArtifactVersions) ||
		(item.assignedAgentId !== undefined && !isValidIdentifier(item.assignedAgentId)) ||
		(item.selectedAgentName !== undefined &&
			(typeof item.selectedAgentName !== "string" ||
				item.selectedAgentName.length === 0 ||
				item.selectedAgentName.length > MAX_IDENTIFIER_LENGTH ||
				item.selectedAgentName.trim() !== item.selectedAgentName)) ||
		typeof item.integrationOwner !== "boolean" ||
		!(["completed", "settled"] as const).includes(item.dependencyPolicy) ||
		!(["read-only", "idempotent", "mutating"] as const).includes(item.sideEffectPolicy) ||
		(item.verifierFor !== undefined && !isValidIdentifier(item.verifierFor)) ||
		![
			item.dependencies,
			item.dependents,
			item.inputArtifacts,
			item.requiredCapabilities,
			item.requiredTools,
			item.readPaths,
			item.writePaths,
			item.ownershipKeys,
			item.acceptanceCriteria,
		].every(
			(values) =>
				Array.isArray(values) &&
				values.every(
					(value) =>
						typeof value === "string" &&
						value.length > 0 &&
						value.length <= MAX_TEXT_LENGTH &&
						value.trim() === value,
				),
		) ||
		!item.requiredArtifactVersions ||
		typeof item.requiredArtifactVersions !== "object" ||
		Array.isArray(item.requiredArtifactVersions) ||
		!Object.entries(item.requiredArtifactVersions).every(
			([id, version]) =>
				isValidIdentifier(id) &&
				typeof version === "string" &&
				version.length > 0 &&
				version.length <= MAX_IDENTIFIER_LENGTH &&
				version.trim() === version,
		) ||
		(item.acceptedExecutionPlanId !== undefined &&
			(typeof item.acceptedExecutionPlanId !== "string" ||
				!/^[a-f0-9]{64}$/u.test(item.acceptedExecutionPlanId))) ||
		!Object.entries(item.inputArtifactVersions).every(
			([id, value]) =>
				isValidIdentifier(id) &&
				typeof value === "string" &&
				value.length > 0 &&
				value.length <= MAX_IDENTIFIER_LENGTH &&
				value.trim() === value,
		) ||
		!Array.isArray(item.invalidationReasons) ||
		!item.invalidationReasons.every(
			(reason) =>
				typeof reason === "string" &&
				reason.length > 0 &&
				reason.length <= MAX_TEXT_LENGTH &&
				reason.trim() === reason,
		) ||
		(item.outcomeReason !== undefined &&
			(typeof item.outcomeReason !== "string" ||
				item.outcomeReason.length > MAX_TEXT_LENGTH ||
				item.outcomeReason.trim() !== item.outcomeReason)) ||
		typeof item.verificationAccepted !== "boolean"
	) {
		throw new Error(`Malformed stored WorkItem ${String(item?.id ?? "unknown")}`);
	}
}

function validStoredArtifacts(
	values: WorkArtifactReference[],
	producerTaskId: string,
	itemGeneration: number,
): boolean {
	const seen = new Set<string>();
	return values.every(
		(artifact) =>
			artifact !== null &&
			typeof artifact === "object" &&
			Object.keys(artifact).every((key) =>
				["id", "kind", "version", "digest", "producerTaskId", "generation", "verified"].includes(
					key,
				),
			) &&
			isValidIdentifier(artifact.id) &&
			claimUnique(artifact.id, seen) &&
			typeof artifact.kind === "string" &&
			artifact.kind.length > 0 &&
			artifact.kind.length <= MAX_IDENTIFIER_LENGTH &&
			artifact.kind.trim() === artifact.kind &&
			typeof artifact.version === "string" &&
			artifact.version.length > 0 &&
			artifact.version.length <= MAX_IDENTIFIER_LENGTH &&
			artifact.version.trim() === artifact.version &&
			(artifact.digest === undefined ||
				(typeof artifact.digest === "string" &&
					artifact.digest.length > 0 &&
					artifact.digest.length <= MAX_TEXT_LENGTH &&
					artifact.digest.trim() === artifact.digest)) &&
			artifact.producerTaskId === producerTaskId &&
			Number.isSafeInteger(artifact.generation) &&
			Number(artifact.generation) >= 0 &&
			Number(artifact.generation) <= itemGeneration &&
			typeof artifact.verified === "boolean",
	);
}

function claimUnique(value: string, seen: Set<string>): boolean {
	if (seen.has(value)) return false;
	seen.add(value);
	return true;
}

function normalizeStoredArtifacts(
	values: WorkArtifactReference[],
	defaultProducerTaskId: string,
	defaultGeneration: number,
): WorkArtifactReference[] {
	if (!validStoredArtifacts(values, defaultProducerTaskId, defaultGeneration)) {
		throw new Error(`Malformed stored artifacts for WorkItem ${defaultProducerTaskId}`);
	}
	return values.map((value) => structuredClone(value));
}

function normalizeArtifacts(
	values: Array<Omit<WorkArtifactReference, "producerTaskId" | "generation">>,
	producerTaskId: string,
	generation: number,
): WorkArtifactReference[] {
	if (values.length > MAX_LIST_ITEMS) throw new Error("Too many WorkItem artifacts");
	const seen = new Set<string>();
	return values.map((value) => {
		validateIdentifier(value.id, "artifact id");
		if (seen.has(value.id)) throw new Error(`Duplicate artifact id ${value.id}`);
		seen.add(value.id);
		const kind = bounded(value.kind, MAX_IDENTIFIER_LENGTH);
		const version = bounded(value.version, MAX_IDENTIFIER_LENGTH);
		if (!kind || !version) throw new Error(`Artifact ${value.id} requires kind and version`);
		return {
			id: value.id,
			kind,
			version,
			...(value.digest ? { digest: bounded(value.digest, MAX_TEXT_LENGTH) } : {}),
			producerTaskId,
			generation,
			verified: value.verified === true,
		};
	});
}

function normalizeVersionMap(value: Record<string, string> | undefined): Record<string, string> {
	if (value === undefined) return {};
	const entries = Object.entries(value);
	if (entries.length > MAX_LIST_ITEMS) throw new Error("Too many artifact version requirements");
	return Object.fromEntries(
		entries.map(([id, version]) => {
			validateIdentifier(id, "artifact version id");
			const normalized = bounded(version, MAX_IDENTIFIER_LENGTH);
			if (!normalized) throw new Error(`Artifact ${id} requires a version`);
			return [id, normalized];
		}),
	);
}

function uniqueBounded(values: readonly string[], label: string): string[] {
	if (!Array.isArray(values) || values.length > MAX_LIST_ITEMS) {
		throw new Error(`Too many WorkItem ${label} values`);
	}
	const result: string[] = [];
	const seen = new Set<string>();
	for (const value of values) {
		if (typeof value !== "string") throw new Error(`Invalid WorkItem ${label}`);
		const normalized = bounded(value, MAX_TEXT_LENGTH);
		if (!normalized) throw new Error(`Empty WorkItem ${label}`);
		if (!seen.has(normalized)) result.push(normalized);
		seen.add(normalized);
	}
	return result;
}

function isValidIdentifier(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length >= 1 &&
		value.length <= MAX_IDENTIFIER_LENGTH &&
		/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
	);
}

function validateIdentifier(value: string, label: string): void {
	if (!isValidIdentifier(value)) {
		throw new Error(`Invalid ${label}`);
	}
}

function bounded(value: string, maxLength: number): string {
	return value.trim().slice(0, maxLength);
}
