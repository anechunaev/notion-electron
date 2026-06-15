import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
	dependencies?: Record<string, string>;
};

// `electron` and Node builtins must stay external in every Electron-process
// bundle: the `electron` npm package is a wrapper that resolves the binary path
// using `__dirname` (invalid in this ESM output) and returns a string, not the
// real API. Bundling it crashes the main process at load and leaves preloads
// without `contextBridge`/`ipcRenderer`.
const electronAndBuiltins = ['electron', /^electron\/.+/, ...builtinModules.flatMap((name) => [name, `node:${name}`])];

// Main additionally externalizes every runtime dependency so they load from
// node_modules at runtime (native modules like `sharp` can't be bundled).
const mainExternals = [...electronAndBuiltins, ...Object.keys(pkg.dependencies ?? {})];

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				external: mainExternals,
				input: { index: resolve('src/main/index.ts') },
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				external: electronAndBuiltins,
				input: {
					tab: resolve('src/preload/tab.ts'),
					docs: resolve('src/preload/docs.ts'),
					options: resolve('src/preload/options.ts'),
				},
				// Sandboxed renderers (Electron's default) only support CommonJS
				// preloads, so emit .cjs rather than the ESM .mjs default.
				output: {
					format: 'cjs',
					entryFileNames: '[name].cjs',
				},
			},
		},
	},
	renderer: {
		root: 'src/renderer',
		// Static assets (icons, logos) are served verbatim from the project's
		// assets/ directory and referenced with root-absolute paths in the pages.
		publicDir: resolve('assets'),
		// Relative base so built asset URLs work under the file:// protocol.
		base: './',
		build: {
			rollupOptions: {
				input: {
					titlebar: resolve('src/renderer/titlebar/index.html'),
					options: resolve('src/renderer/options/index.html'),
					offline: resolve('src/renderer/offline/index.html'),
				},
			},
		},
	},
});
