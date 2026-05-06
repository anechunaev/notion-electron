import { BrowserWindow, shell } from 'electron';

export const functionalKeymap = {
	openHelpF1: {
		accelerator: 'F1',
		action: () => {
			// Opens Notion's official help center in the user's default native web browser
			shell.openExternal('https://www.notion.so/help');
		},
	},
	findInPageF3: {
		accelerator: 'F3',
		action: ({ pageWebContents }) => {
			if (!pageWebContents) return;
			pageWebContents.focus();
			// Notion usually handles F3 natively, but if it's being blocked,
			// you can manually trigger the internal find dialog:
			pageWebContents.sendInputEvent({
				type: 'keyDown',
				keyCode: 'f',
				modifiers: ['control'],
			});
		},
	},

	// F4: Focus Address Bar (Skipped: No address bar in this wrapper)

	pageReloadF5: {
		accelerator: 'F5',
		action: ({ pageWebContents }) => {
			if (!pageWebContents) return;
			pageWebContents.reloadIgnoringCache();
		},
	},

	// F6: Cycle Focus (Skipped: No toolbars to cycle through)
	// F7: Caret Browsing (Skipped: Requires heavy custom DOM manipulation in Electron)
	// F8: Pause Debugger (Skipped: Handled natively when DevTools is open)
	// F9: Reader Mode (Skipped: Not applicable to Notion)
	// F10: Focus Menu Bar (Skipped: App menu is disabled in index.mjs)

	toggleFullScreenF11: {
		accelerator: 'F11',
		action: ({ pageWebContents, titlebarWebContents }) => {
			const contents = pageWebContents || titlebarWebContents;
			if (!contents) return;

			const win = BrowserWindow.fromWebContents(contents);
			if (win) {
				win.setFullScreen(!win.isFullScreen());
			}
		},
	},

	openDevToolsF12: {
		accelerator: 'F12',
		action: ({ pageWebContents }) => {
			if (!pageWebContents) return;
			pageWebContents.toggleDevTools();
		},
	},
};
