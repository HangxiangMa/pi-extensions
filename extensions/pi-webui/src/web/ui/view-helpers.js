export function withStableKeys(values) {
	const occurrences = new Map();
	return values.map((value) => {
		const signature = JSON.stringify(value);
		const occurrence = occurrences.get(signature) ?? 0;
		occurrences.set(signature, occurrence + 1);
		return { key: `${signature}:${occurrence}`, value };
	});
}

export function connectionColor(model) {
	if (model.closed || model.stale) return "red";
	if (!model.connected) return "amber";
	return model.activity === "running" ? "blue" : "jade";
}

export function roleLabel(message) {
	if (message.role === "user") return "You";
	if (message.role === "assistant") return message.final ? "Pi" : "Pi · Streaming";
	if (message.role === "toolResult") {
		return message.toolName ? `Tool · ${message.toolName}` : "Tool";
	}
	return message.role;
}

export function knownRole(role) {
	if (role === "user" || role === "assistant" || role === "toolResult") return role;
	return "other";
}

export function safeJson(value) {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return "Details unavailable";
	}
}

export function resizeInput(input) {
	if (!input) return;
	input.style.height = "auto";
	input.style.height = `${Math.min(input.scrollHeight, window.innerHeight * 0.32)}px`;
}

export function isSupportedImageFile(file) {
	return (
		[
			"image/png",
			"image/jpeg",
			"image/webp",
			"image/gif",
			"image/bmp",
			"image/x-ms-bmp",
			"image/tiff",
			"image/heic",
			"image/heif",
			"image/avif",
		].includes(file.type) || /\.(?:bmp|tif|tiff|heic|heif|avif)$/i.test(file.name || "")
	);
}

export function hasDraggedFile(event) {
	return [...(event.dataTransfer?.items ?? [])].some((item) => item.kind === "file");
}

export function isNearBottom() {
	return document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 160;
}
