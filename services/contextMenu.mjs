import { ipcMain, shell, Menu, clipboard, nativeTheme, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { shortcutMap } from '../lib/shortcuts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

		ipcMain.on('show-all-tabs-menu', () => {
			const tabIds = this.#tabService.getTabIds();
			const menu = Menu.buildFromTemplate(
				this.#templateAllTabsContextMenu(tabIds)
			);
			menu.popup({ window: this.#window });
		});
	}

	#templateTabContextMenu(tabId) {
		const view = this.#tabService.getTabView(tabId);
		const isPinned = this.#tabService.isPinned(tabId);
		const titlebar = this.#tabService.getTitleBarView();
		return [
			{
				label: isPinned ? 'Unpin Tab' : 'Pin Tab',
				click: () => {
					this.#tabService.togglePinTab(tabId, !isPinned);
					titlebar.webContents.send('context-menu-command', { id: 'pin', tabId });
				},
			},
			{ type: 'separator' },
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
						tabIds: this.#tabService.getTabIds().filter((id) => id !== tabId && !this.#tabService.isPinned(id)),
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
				enabled: Boolean(view),
			},
			{ type: 'separator' },
			{
				label: 'Zoom In',
				accelerator: shortcutMap.zoomIn.accelerator,
				click: () => this.#tabService.runAction('zoomIn'),
			},
			{
				label: 'Zoom Out',
				accelerator: shortcutMap.zoomOut.accelerator,
				click: () => this.#tabService.runAction('zoomOut'),
			},
			{
				label: 'Reset Zoom',
				accelerator: shortcutMap.zoomReset.accelerator,
				click: () => this.#tabService.runAction('zoomReset'),
			},
			{ type: 'separator' },
			{
				label: 'Reload',
				accelerator: shortcutMap.pageReload.accelerator,
				click: () => this.#tabService.runAction('pageReload'),
			},
			{
				label: 'Back',
				accelerator: shortcutMap.historyBack.accelerator,
				click: () => this.#tabService.runAction('historyBack'),
				enabled: Boolean(view?.webContents?.navigationHistory.canGoBack()),
			},
			{
				label: 'Forward',
				accelerator: shortcutMap.historyForward.accelerator,
				click: () => this.#tabService.runAction('historyForward'),
				enabled: Boolean(view?.webContents?.navigationHistory.canGoForward()),
			},
			{ type: 'separator' },
			{
				label: 'Copy URL',
				click: () => {
					clipboard.writeText(view?.webContents?.getURL());
				},
			},
			{
				label: 'Open in Browser',
				click: () => {
					shell.openExternal(view?.webContents?.getURL());
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
					this.#tabService.requestTab({ url: linkUrl });
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

	#templateAllTabsContextMenu(tabs) {
		const dir = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
		const defaultIcon = nativeImage
			.createFromPath(path.join(__dirname, `../assets/icons/${dir}/document.png`))
			.resize({ width: 16, height: 16 });
		return tabs.map(id => {
			const storedIcon = this.#tabService.getTabIcon(id);
			const icon = storedIcon && !storedIcon.includes("favicon.ico")
				? nativeImage.createFromDataURL(this.#tabService.getTabIcon(id)).resize({ width: 16, height: 16 })
				: defaultIcon;
			return {
				label: (this.#tabService.getTabTitle(id) ?? 'New Tab') + (this.#tabService.isPinned(id) ? ' 📌' : ''),
				click: () => {
					this.#tabService.requestTab({ tabId: id });
				},
				type: 'radio',
				checked: id === this.#tabService.getCurrentTabId(),
				icon,
			};
		});
	}
}

export default ContextMenuService;
