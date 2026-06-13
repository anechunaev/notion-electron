import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: { index: resolve('src/main/index.ts') },
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: {
					'tab-preload': resolve('src/preload/tab-preload.ts'),
					'docs-preload': resolve('src/preload/docs-preload.ts'),
					'options-preload': resolve('src/preload/options-preload.ts'),
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
					titlebar: resolve('src/renderer/titlebar.html'),
					options: resolve('src/renderer/options.html'),
					offline: resolve('src/renderer/offline.html'),
				},
			},
		},
	},
});
