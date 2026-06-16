import { BrowserWindow, shell } from 'electron';
import type { Keymap } from './types';

export const functionalKeymap = {
	openHelpF1: {
		accelerator: 'F1',
		action: () => {
			shell.openExternal('https://www.notion.com/help');
		},
	},
	findInPageF3: {
		accelerator: 'F3',
		action: ({ pageWebContents }) => {
			if (!pageWebContents) return;
			pageWebContents.focus();
			pageWebContents.sendInputEvent({
				type: 'keyDown',
				keyCode: 'f',
				modifiers: ['control'],
			});
		},
	},

	pageReloadF5: {
		accelerator: 'F5',
		action: ({ pageWebContents }) => {
			if (!pageWebContents) return;
			pageWebContents.reloadIgnoringCache();
		},
	},

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
} satisfies Keymap;
