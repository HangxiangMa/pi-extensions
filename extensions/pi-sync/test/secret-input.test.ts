import assert from "node:assert/strict";
import test from "node:test";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import { createCustomSelectorHarness, createMockContext } from "../../../test/support.js";
import { chooseS3Credentials } from "../src/s3-credentials-ui.js";
import { promptSecret } from "../src/secret-input.js";

test("masked secret input never renders plaintext and submits pasted text", async () => {
	const secret = "private-password";
	let rendered: string[] = [];
	const { ctx } = createMockContext({
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 24);
			harness.setFocused(true);
			rendered = harness.handleInput(`\u001b[200~${secret}\u001b[201~`);
			assert.doesNotMatch(rendered.join("\n"), new RegExp(secret));
			assert.match(rendered.join("\n"), /•+/u);
			assert.equal(rendered.join("\n").includes(CURSOR_MARKER), true);
			for (const line of rendered) assert.ok(visibleWidth(line) <= 24);
			harness.handleInput("tui.input.submit");
			return harness.result;
		},
	});

	assert.equal(await promptSecret(ctx, "WebDAV password"), secret);
});

test("stored S3 credentials reject a blank access key ID", async () => {
	const { ctx, notifications } = createMockContext({
		hasUI: true,
		mode: "tui",
		select: async () => "Store credentials privately",
		input: async () => "",
	});

	assert.equal(await chooseS3Credentials(ctx), undefined);
	assert.match(notifications.at(-1)?.message ?? "", /Access key ID is required/i);
});

test("masked secret input cancellation returns without a secret", async () => {
	const { ctx } = createMockContext({
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 12);
			harness.handleInput("secret");
			harness.handleInput("tui.select.cancel");
			return harness.result;
		},
	});

	assert.equal(await promptSecret(ctx, "Password"), undefined);
});
