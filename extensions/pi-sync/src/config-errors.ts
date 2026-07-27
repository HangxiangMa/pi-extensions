export function isMissingConfigError(error: unknown) {
	return (
		error instanceof Error &&
		(error.message.startsWith("Missing pi-sync config:") ||
			error.message.startsWith("Missing pi-sync WebDAV config:") ||
			error.message.startsWith("Missing pi-sync Git config:"))
	);
}
