export function sanitizeTerminalText(value: string): string {
	let result = "";
	for (let index = 0; index < value.length; ) {
		const codePoint = value.codePointAt(index) ?? 0;
		const character = String.fromCodePoint(codePoint);
		if (codePoint === 0x1b || codePoint === 0x9b || codePoint === 0x9d) {
			index = skipTerminalEscape(value, index, codePoint);
			continue;
		}
		if (
			codePoint <= 0x1f ||
			(codePoint >= 0x7f && codePoint <= 0x9f) ||
			codePoint === 0x2028 ||
			codePoint === 0x2029
		) {
			if (
				codePoint === 0x09 ||
				codePoint === 0x0a ||
				codePoint === 0x0d ||
				codePoint === 0x85 ||
				codePoint === 0x2028 ||
				codePoint === 0x2029
			) {
				result += " ";
			}
			index += character.length;
			continue;
		}
		result += character;
		index += character.length;
	}
	return result;
}

function skipTerminalEscape(value: string, start: number, codePoint: number): number {
	let index = start + 1;
	const next = value.charCodeAt(index);
	const isOsc = codePoint === 0x9d || (codePoint === 0x1b && next === 0x5d);
	if (isOsc) {
		if (codePoint === 0x1b) index += 1;
		while (index < value.length) {
			const current = value.charCodeAt(index);
			if (current === 0x07 || current === 0x9c) return index + 1;
			if (current === 0x1b && value.charCodeAt(index + 1) === 0x5c) return index + 2;
			index += 1;
		}
		return index;
	}
	const isCsi = codePoint === 0x9b || (codePoint === 0x1b && next === 0x5b);
	if (isCsi) {
		if (codePoint === 0x1b) index += 1;
		while (index < value.length) {
			const current = value.charCodeAt(index);
			index += 1;
			if (current >= 0x40 && current <= 0x7e) break;
		}
		return index;
	}
	return Math.min(value.length, start + (codePoint === 0x1b ? 2 : 1));
}
