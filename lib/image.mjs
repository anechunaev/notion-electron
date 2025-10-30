import decodeIco from "decode-ico";
import sharp from "sharp";
import { createJimp } from "@jimp/core";
import png from "@jimp/js-png";
import * as resize from "@jimp/plugin-resize";

const Jimp = createJimp({
	plugins: [resize.methods],
	formats: [png],
});

export function downloadIconAsDataString(url) {
	return fetch(url, {
		method: 'GET',
		headers: {
			'Accept': '*/*',
		},
	})
		.then((response) => {
			if (!response.ok) {
				throw new Error(
					`Failed to fetch icon from ${url}: ${response.statusText}`
				);
			}
			return response.arrayBuffer();
		})
		.then((arrayBuffer) => {
			let buffer = Buffer.from(arrayBuffer);
			if (url.endsWith(".ico")) {
				try {
					const imageBuffers = decodeIco(arrayBuffer);
					const bestSizeBuffer = imageBuffers.find((img) => img.width === 32) || imageBuffers[0];
					if (bestSizeBuffer.type === 'png') {
						return Promise.resolve(Buffer.from(bestSizeBuffer.data));
					} else if (bestSizeBuffer.type === 'bmp') {
						const img = Jimp.fromBitmap({
							data: Buffer.from(bestSizeBuffer.data),
							width: bestSizeBuffer.width,
							height: bestSizeBuffer.height,
						});
						return img.getBuffer("image/png");
					} else {
						return Promise.resolve(Buffer.from([]));
					}
				} catch (error) {
					console.error("Error decoding ICO file:", error);
					return Promise.resolve(Buffer.from([]));
				}
			}
			return Promise.resolve(buffer);
		})
		.then(buffer => sharp(buffer).resize(32, 32).png().toBuffer())
		.then(pngBuffer => `data:image/png;base64,${pngBuffer.toString("base64")}`)
		.catch((error) => {
			console.error("Error downloading or converting icon:", error);
			return null;
		});
}

export function convertIcon(urlOrDataString) {
	if (urlOrDataString.startsWith("data:")) {
		const buffer = Buffer.from(urlOrDataString.split(",")[1], "base64");
		return sharp(buffer).resize(32, 32).png().toBuffer()
			.then(pngBuffer => `data:image/png;base64,${pngBuffer.toString("base64")}`);
	} else {
		return downloadIconAsDataString(urlOrDataString);
	}
}
