import { ipcMain, shell, Menu, clipboard } from 'electron';

class ContextMenuService {
	#window = null;
	#tabService = null;

	constructor(window, tabService) {
		this.#window = window;
		this.#tabService = tabService;

		ipcMain.on('show-tab-context-menu', (event, tabId) => {
			const menu = Menu.buildFromTemplate(
				this.#templateTabContextMenu(tabId)
			);
			menu.popup({ window: this.#window });
		});

		ipcMain.on('show-page-context-menu', (event, payload) => {
			const wc = event.sender;
			const menu = Menu.buildFromTemplate(
				this.#templatePageContextMenu(wc, payload)
			);
			menu.popup({ window: this.#window });
		});
	}

	#templateTabContextMenu(tabId) {
		const view = this.#tabService.getTabView(tabId);
		const titlebar = this.#tabService.getTitleBarView();
		return [
			{
				label: 'Close Tab',
				click: () => {
					titlebar.webContents.send('context-menu-command', { id: 'close', tabId });
				},
			},
			{
				label: 'Close Other Tabs',
				click: () => {
					titlebar.webContents.send('context-menu-command', {
						id: 'closeOther',
						tabIds: this.#tabService.getTabIds().filter((id) => id !== tabId),
					});
				},
			},
			{
				label: 'Close All Tabs',
				click: () => {
					titlebar.webContents.send('context-menu-command', { id: 'closeAll' });
				},
			},
			{ type: 'separator' },
			{
				label: 'Duplicate Current Tab',
				click: () => {
					this.#tabService.duplicateTab(tabId);
				},
			},
			{ type: 'separator' },
			{
				label: 'Reload',
				accelerator: 'CmdOrCtrl+R',
				click: () => {
					view.webContents.reloadIgnoringCache();
				},
			},
			{
				label: 'Back',
				accelerator: 'CmdOrCtrl+[',
				click: () => {
					view.webContents.navigationHistory.goBack();
				},
				enabled: view.webContents.navigationHistory.canGoBack(),
			},
			{
				label: 'Forward',
				accelerator: 'CmdOrCtrl+]',
				click: () => {
					view.webContents.navigationHistory.goForward();
				},
				enabled: view.webContents.navigationHistory.canGoForward(),
			},
			{ type: 'separator' },
			{
				label: 'Copy URL',
				click: () => {
					clipboard.writeText(view.webContents.getURL());
				},
			},
			{
				label: 'Open in Browser',
				click: () => {
					shell.openExternal(view.webContents.getURL());
				},
			},
		];
	}

	#templatePageContextMenu(wc, { isLink, isImage, isSelection, linkUrl, imageUrl }) {
		return [
			{
				label: 'Cut',
				role: 'cut',
				accelerator: 'CmdOrCtrl+X',
				enabled: isSelection,
			},
			{
				label: 'Copy',
				role: 'copy',
				accelerator: 'CmdOrCtrl+C',
				enabled: isSelection,
			},
			{
				label: 'Paste',
				role: 'paste',
				accelerator: 'CmdOrCtrl+V',
			},
			{ type: 'separator' },
			{
				label: 'Copy Link URL',
				click: () => {
					clipboard.writeText(linkUrl);
				},
				visible: isLink,
			},
			{
				label: 'Open Link in New Tab',
				click: () => {
					this.#tabService.requestTab(linkUrl);
				},
				visible: isLink,
				enabled: linkUrl?.startsWith('https://notion') || linkUrl?.startsWith('https://www.notion'),
			},
			{
				label: 'Open Link in Browser',
				click: () => {
					shell.openExternal(linkUrl);
				},
				visible: isLink,
			},
			{
				label: 'Save Image As...',
				click: () => {
					wc.downloadURL(imageUrl);
				},
				visible: isImage,
			},
			{
				label: 'Open Page in Browser',
				click: () => {
					shell.openExternal(wc.getURL());
				},
			},
		];
	}
}

export default ContextMenuService;
