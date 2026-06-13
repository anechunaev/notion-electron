import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Static runtime assets (icons) live outside the bundle. In production they are
// shipped via electron-builder `extraResources` next to the app; in development
// they are read straight from the project's `assets/` directory.
export function resolveAsset(relativePath: string): string {
	const base = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(app.getAppPath(), 'assets');
	return path.join(base, relativePath);
}

// Preload scripts are emitted by electron-vite into `out/preload`. The bundled
// main entry runs from `out/main`, so resolve siblings one directory up.
export function resolvePreload(name: string): string {
	return path.join(__dirname, '../preload', name);
}

// A BrowserWindow or WebContents — anything able to load a page.
interface RendererLoadable {
	loadURL(url: string): Promise<void>;
	loadFile(filePath: string, options?: { query?: Record<string, string> }): Promise<void>;
}

// Load a renderer HTML page either from the Vite dev server (development) or
// from the built files in `out/renderer` (production).
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
	const file = path.join(__dirname, `../renderer/${page}/index.html`);
	return query ? target.loadFile(file, { query }) : target.loadFile(file);
}
