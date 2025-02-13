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
				role: 'forceReload',
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
}

export default ContextMenuService;
