import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const UNKNOWN_NO_DETAILS_RE = /Unknown error \(no error details in response\)/i;
const RETRYABLE_HINT = "provider returned error";
const EXTENSION_TAG = "[unknown-error-retry]";

export default function unknownErrorRetry(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setStatus("unknown-error-retry", "unknown-error retry: on");
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setStatus("unknown-error-retry", undefined);
	});

	pi.on("message_end", (event, ctx) => {
		const message = event.message as unknown as {
			role?: string;
			stopReason?: string;
			errorMessage?: unknown;
			[key: string]: unknown;
		};

		if (message.role !== "assistant") return;
		if (message.stopReason !== "error") return;
		if (typeof message.errorMessage !== "string") return;
		if (!UNKNOWN_NO_DETAILS_RE.test(message.errorMessage)) return;

		// Avoid appending the hint repeatedly if a resumed/replayed message already has it.
		if (message.errorMessage.includes(EXTENSION_TAG)) return;

		// pi already has agent-level auto-retry for transient provider errors, but its
		// matcher does not classify this empty-detail "Unknown error" message as retryable.
		// Adding this hint before the message is finalized makes pi's built-in auto-retry
		// path pick it up, remove the failed assistant message from live agent state, and
		// call agent.continue() with the normal retry settings/backoff.
		const errorMessage = `${message.errorMessage}\n\n${EXTENSION_TAG} ${RETRYABLE_HINT}; treating empty-detail provider failure as retryable.`;

		if (ctx.hasUI) {
			ctx.ui.notify(
				"Matched provider 'Unknown error (no error details in response)'; letting pi auto-retry this turn.",
				"warning",
			);
		}

		return {
			message: {
				...message,
				errorMessage,
			} as typeof event.message,
		};
	});
}
