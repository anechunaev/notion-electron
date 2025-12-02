export const shortcutMap = {
	zoomIn: {
		accelerator: 'CmdOrCtrl+=',
		action: ({ pageWebContents, titlebarWebContents }) => {
			if (!pageWebContents) return;
			const currentZoom = pageWebContents.getZoomFactor();
			const zoom = currentZoom + 0.1 > 5 ? 5 : currentZoom + 0.1;
			pageWebContents.setZoomFactor(zoom);
			titlebarWebContents.send('zoom-factor', zoom);
		},
	},
	zoomOut: {
		accelerator: 'CmdOrCtrl+-',
		action: ({ pageWebContents, titlebarWebContents }) => {
			if (!pageWebContents) return;
			const currentZoom = pageWebContents.getZoomFactor();
			const zoom = currentZoom - 0.1 < 0.25 ? 0.25 : currentZoom - 0.1;
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
			// titlebarWebContents.send('tab-request', { url: 'https://www.notion.so' });
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
};

function toTitleCase(str) {
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function detectShortcut(input, event, pageWebContents, titlebarWebContents) {
	const accelerator = [];
	if (input.control) accelerator.push('CmdOrCtrl');
	if (input.shift) accelerator.push('Shift');
	if (input.alt) accelerator.push('Alt');
	if (input.meta) accelerator.push('Meta');
	accelerator.push(input.key.length === 1 ? toTitleCase(input.key) : input.key);
	const accelString = accelerator.join('+');

	const shortcut = Object.values(shortcutMap).find(s => s.accelerator === accelString);
	if (shortcut) {
		shortcut.action({
			pageWebContents,
			titlebarWebContents,
		});
		event.preventDefault();
	}
}