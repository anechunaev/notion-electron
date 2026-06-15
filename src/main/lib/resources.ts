import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveAsset(relativePath: string): string {
	const base = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(app.getAppPath(), 'assets');
	return path.join(base, relativePath);
}

export function resolvePreload(name: string): string {
	return path.join(dirname, '../preload', name);
}

interface RendererLoadable {
	loadURL(url: string): Promise<void>;
	loadFile(filePath: string, options?: { query?: Record<string, string> }): Promise<void>;
}

export function loadRendererPage(
	target: RendererLoadable,
	page: string,
	query?: Record<string, string>,
): Promise<void> {
	const devUrl = process.env.ELECTRON_RENDERER_URL;
	if (devUrl) {
		const search = query ? `?${new URLSearchParams(query)}` : '';
		return target.loadURL(`${devUrl}/${page}/index.html${search}`);
	}
	const file = path.join(dirname, `../renderer/${page}/index.html`);
	return query ? target.loadFile(file, { query }) : target.loadFile(file);
}
