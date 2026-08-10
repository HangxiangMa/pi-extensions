import type { CompletionDelivery, SubagentTransportKind } from "./agents.js";

export function resolveStatefulTransportKind(
	value: SubagentTransportKind | undefined,
): SubagentTransportKind {
	return value ?? "subprocess";
}

export function resolveCompletionDelivery(
	value: CompletionDelivery | undefined,
): CompletionDelivery {
	return value ?? "next-turn";
}
