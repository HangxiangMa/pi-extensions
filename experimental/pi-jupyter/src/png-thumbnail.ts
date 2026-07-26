import { inflateSync } from "node:zlib";

export type DecodedPng = {
	width: number;
	height: number;
	pixels: Uint8ClampedArray;
};

const MAX_PNG_PIXELS = 16_000_000;
const MAX_INFLATED_BYTES = MAX_PNG_PIXELS * 4 + 4096;

export function decodePng(base64Data: string): DecodedPng {
	const bytes = Buffer.from(base64Data, "base64");
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) {
		throw new Error("not a PNG");
	}

	let offset = 8;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	let palette: Buffer | undefined;
	let transparency: Buffer | undefined;
	const idat: Buffer[] = [];

	while (offset + 12 <= bytes.length) {
		const length = bytes.readUInt32BE(offset);
		const chunkEnd = offset + 12 + length;
		if (chunkEnd > bytes.length) throw new Error("truncated PNG chunk");
		const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
		const data = bytes.subarray(offset + 8, offset + 8 + length);
		offset = chunkEnd;

		if (type === "IHDR") {
			if (data.length !== 13) throw new Error("invalid PNG header");
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			bitDepth = data[8] ?? 0;
			colorType = data[9] ?? 0;
			if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
				throw new Error("unsupported PNG format");
			}
		} else if (type === "PLTE") palette = Buffer.from(data);
		else if (type === "tRNS") transparency = Buffer.from(data);
		else if (type === "IDAT") idat.push(Buffer.from(data));
		else if (type === "IEND") break;
	}

	if (!width || !height || idat.length === 0) throw new Error("missing PNG data");
	if (width * height > MAX_PNG_PIXELS) throw new Error("PNG dimensions are too large");
	if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);

	const channels = pngChannels(colorType);
	const stride = width * channels;
	const expectedBytes = height * (stride + 1);
	if (expectedBytes > MAX_INFLATED_BYTES) throw new Error("PNG output is too large");
	const inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedBytes });
	if (inflated.length !== expectedBytes) throw new Error("invalid PNG scanline data");

	const raw = Buffer.alloc(height * stride);
	let inOffset = 0;
	let outOffset = 0;
	let previous = Buffer.alloc(stride);
	for (let y = 0; y < height; y++) {
		const filter = inflated[inOffset++];
		const scanline = inflated.subarray(inOffset, inOffset + stride);
		inOffset += stride;
		const recon = Buffer.alloc(stride);
		for (let x = 0; x < stride; x++) {
			const left = x >= channels ? (recon[x - channels] ?? 0) : 0;
			const up = previous[x] ?? 0;
			const upLeft = x >= channels ? (previous[x - channels] ?? 0) : 0;
			const value = scanline[x] ?? 0;
			switch (filter) {
				case 0:
					recon[x] = value;
					break;
				case 1:
					recon[x] = (value + left) & 0xff;
					break;
				case 2:
					recon[x] = (value + up) & 0xff;
					break;
				case 3:
					recon[x] = (value + Math.floor((left + up) / 2)) & 0xff;
					break;
				case 4:
					recon[x] = (value + paeth(left, up, upLeft)) & 0xff;
					break;
				default:
					throw new Error(`unsupported PNG filter ${filter}`);
			}
		}
		recon.copy(raw, outOffset);
		outOffset += stride;
		previous = recon;
	}

	return {
		width,
		height,
		pixels: convertToRgba(raw, width, height, colorType, palette, transparency),
	};
}

function convertToRgba(
	raw: Buffer,
	width: number,
	height: number,
	colorType: number,
	palette?: Buffer,
	transparency?: Buffer,
): Uint8ClampedArray {
	const pixels = new Uint8ClampedArray(width * height * 4);
	for (let i = 0, p = 0; i < raw.length; p++) {
		let r = 0;
		let g = 0;
		let b = 0;
		let a = 255;
		if (colorType === 0) {
			r = g = b = raw[i++] ?? 0;
			if (transparency?.length === 2 && r === transparency.readUInt16BE(0)) a = 0;
		} else if (colorType === 2) {
			r = raw[i++] ?? 0;
			g = raw[i++] ?? 0;
			b = raw[i++] ?? 0;
			if (
				transparency?.length === 6 &&
				r === transparency.readUInt16BE(0) &&
				g === transparency.readUInt16BE(2) &&
				b === transparency.readUInt16BE(4)
			)
				a = 0;
		} else if (colorType === 3) {
			const index = raw[i++] ?? 0;
			if (!palette || index * 3 + 2 >= palette.length) throw new Error("invalid PNG palette");
			r = palette[index * 3] ?? 0;
			g = palette[index * 3 + 1] ?? 0;
			b = palette[index * 3 + 2] ?? 0;
			a = transparency?.[index] ?? 255;
		} else if (colorType === 4) {
			r = g = b = raw[i++] ?? 0;
			a = raw[i++] ?? 0;
		} else {
			r = raw[i++] ?? 0;
			g = raw[i++] ?? 0;
			b = raw[i++] ?? 0;
			a = raw[i++] ?? 0;
		}
		const output = p * 4;
		pixels[output] = r;
		pixels[output + 1] = g;
		pixels[output + 2] = b;
		pixels[output + 3] = a;
	}
	return pixels;
}

function pngChannels(colorType: number): number {
	switch (colorType) {
		case 0:
		case 3:
			return 1;
		case 2:
			return 3;
		case 4:
			return 2;
		case 6:
			return 4;
		default:
			throw new Error(`unsupported PNG color type ${colorType}`);
	}
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	return pb <= pc ? b : c;
}

export function renderPngThumbnail(
	png: DecodedPng,
	maxWidthCells: number,
	maxHeightCells: number,
): string[] {
	let targetWidth = Math.max(1, Math.min(maxWidthCells, png.width));
	let targetPixelHeight = Math.max(1, Math.round((png.height / png.width) * targetWidth));
	if (Math.ceil(targetPixelHeight / 2) > maxHeightCells) {
		targetPixelHeight = maxHeightCells * 2;
		targetWidth = Math.max(
			1,
			Math.min(maxWidthCells, Math.round((png.width / png.height) * targetPixelHeight)),
		);
	}

	const lines: string[] = [];
	for (let row = 0; row < Math.ceil(targetPixelHeight / 2); row++) {
		let line = "";
		for (let x = 0; x < targetWidth; x++) {
			const upper = samplePngPixel(png, x, row * 2, targetWidth, targetPixelHeight);
			const lower =
				row * 2 + 1 < targetPixelHeight
					? samplePngPixel(png, x, row * 2 + 1, targetWidth, targetPixelHeight)
					: ([255, 255, 255] as const);
			line += `\x1b[38;2;${upper[0]};${upper[1]};${upper[2]}m\x1b[48;2;${lower[0]};${lower[1]};${lower[2]}m▀`;
		}
		lines.push(`${line}\x1b[0m`);
	}
	return lines;
}

function samplePngPixel(
	png: DecodedPng,
	x: number,
	y: number,
	targetWidth: number,
	targetHeight: number,
): readonly [number, number, number] {
	const sx = Math.min(
		png.width - 1,
		Math.max(0, Math.floor(((x + 0.5) / targetWidth) * png.width)),
	);
	const sy = Math.min(
		png.height - 1,
		Math.max(0, Math.floor(((y + 0.5) / targetHeight) * png.height)),
	);
	const offset = (sy * png.width + sx) * 4;
	const alpha = (png.pixels[offset + 3] ?? 0) / 255;
	const blend = (channel: number) =>
		Math.round((png.pixels[offset + channel] ?? 0) * alpha + 255 * (1 - alpha));
	return [blend(0), blend(1), blend(2)];
}
