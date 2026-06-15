import type { Keymap } from './types';

const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

export const actionKeymap = {
	zoomIn: {
		accelerator: 'CmdOrCtrl+=',
		action: ({ pageWebContents, titlebarWebContents }) => {
			if (!pageWebContents) return;
			const currentZoom = pageWebContents.getZoomFactor();
			const zoom = currentZoom + ZOOM_STEP > MAX_ZOOM ? MAX_ZOOM : currentZoom + ZOOM_STEP;
			pageWebContents.setZoomFactor(zoom);
			titlebarWebContents.send('zoom-factor', zoom);
		},
	},
	zoomOut: {
		accelerator: 'CmdOrCtrl+-',
		action: ({ pageWebContents, titlebarWebContents }) => {
			if (!pageWebContents) return;
			const currentZoom = pageWebContents.getZoomFactor();
			const zoom = currentZoom - ZOOM_STEP < MIN_ZOOM ? MIN_ZOOM : currentZoom - ZOOM_STEP;
			pageWebContents.setZoomFactor(zoom);
			titlebarWebContents.send('zoom-factor', zoom);
		},
	},
	zoomReset: {
		accelerator: 'CmdOrCtrl+0',
		action: ({ pageWebContents, titlebarWebContents }) => {
			if (!pageWebContents) return;
			pageWebContents.setZoomFactor(1);
			titlebarWebContents.send('zoom-factor', 1);
		},
	},
	pageReload: {
		accelerator: 'CmdOrCtrl+R',
		action: ({ pageWebContents }) => {
			if (!pageWebContents) return;
			pageWebContents.reloadIgnoringCache();
		},
	},
	historyBack: {
		accelerator: 'CmdOrCtrl+[',
		action: ({ pageWebContents }) => {
			if (!pageWebContents) return;
			if (pageWebContents.navigationHistory.canGoBack()) {
				pageWebContents.navigationHistory.goBack();
			}
		},
	},
	historyForward: {
		accelerator: 'CmdOrCtrl+]',
		action: ({ pageWebContents }) => {
			if (!pageWebContents) return;
			if (pageWebContents.navigationHistory.canGoForward()) {
				pageWebContents.navigationHistory.goForward();
			}
		},
	},
	tabNew: {
		accelerator: 'CmdOrCtrl+T',
		action: ({ titlebarWebContents }) => {
			titlebarWebContents.send('action', 'tab-add');
		},
	},
	tabClose: {
		accelerator: 'CmdOrCtrl+W',
		action: ({ titlebarWebContents }) => {
			titlebarWebContents.send('action', 'tab-close');
		},
	},
	tabNext: {
		accelerator: 'CmdOrCtrl+Tab',
		action: ({ titlebarWebContents }) => {
			titlebarWebContents.send('action', 'tab-next');
		},
	},
	tabPrevious: {
		accelerator: 'CmdOrCtrl+Shift+Tab',
		action: ({ titlebarWebContents }) => {
			titlebarWebContents.send('action', 'tab-previous');
		},
	},
} satisfies Keymap;
