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

// The dev server can reject the first load with a transient error (e.g. a slow
// cold-start Vite dependency-optimization pass), so retry a few times instead
// of leaving the view permanently blank for the rest of the session.
function loadWithRetry(target: RendererLoadable, url: string, attempt = 0): Promise<void> {
	return target.loadURL(url).catch((error: unknown) => {
		if (attempt >= 5) throw error;
		return new Promise<void>((resolve) => {
			setTimeout(resolve, 300);
		}).then(() => loadWithRetry(target, url, attempt + 1));
	});
}

export function loadRendererPage(
	target: RendererLoadable,
	page: string,
	query?: Record<string, string>,
): Promise<void> {
	const devUrl = process.env.ELECTRON_RENDERER_URL;
	if (devUrl) {
		const search = query ? `?${new URLSearchParams(query)}` : '';
		return loadWithRetry(target, `${devUrl}/${page}/index.html${search}`);
	}
	const file = path.join(dirname, `../renderer/${page}/index.html`);
	return query ? target.loadFile(file, { query }) : target.loadFile(file);
}
