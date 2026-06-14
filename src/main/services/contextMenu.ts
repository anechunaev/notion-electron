import {
	ipcMain,
	shell,
	Menu,
	clipboard,
	nativeTheme,
	nativeImage,
	type BaseWindow,
	type WebContents,
	type MenuItemConstructorOptions,
} from 'electron';
import type EventEmitter from 'node:events';
import { shortcutMap } from '../lib/shortcuts/index';
import { resolveAsset } from '../lib/resources';
import type { TabCommands, TabReader } from './tabs.types';

interface PageContextMenuPayload {
	sender: WebContents;
	isLink: boolean;
	isImage: boolean;
	linkUrl: string;
	imageUrl: string;
	isSelection: boolean;
	misspelledWord: string;
	dictionarySuggestions: string[];
}

class ContextMenuService {
	private window: BaseWindow;
	private tabService: TabReader & TabCommands;
	private mainBus: EventEmitter;

	constructor(window: BaseWindow, tabService: TabReader & TabCommands, mainBus: EventEmitter) {
		this.window = window;
		this.tabService = tabService;
		this.mainBus = mainBus;

		ipcMain.on('show-tab-context-menu', (event, tabId: string) => {
			const menu = Menu.buildFromTemplate(this.templateTabContextMenu(tabId));
			menu.popup({ window: this.window });
		});

		this.mainBus.on('show-page-context-menu', (payload: PageContextMenuPayload) => {
			const wc = payload.sender;
			const menu = Menu.buildFromTemplate(this.templatePageContextMenu(wc, payload));
			menu.popup({ window: this.window });
		});

		ipcMain.on('show-all-tabs-menu', () => {
			const tabIds = this.tabService.getTabIds();
			const menu = Menu.buildFromTemplate(this.templateAllTabsContextMenu(tabIds));
			menu.popup({ window: this.window });
		});
	}

	private templateTabContextMenu(tabId: string): MenuItemConstructorOptions[] {
		const view = this.tabService.getTabView(tabId);
		const isPinned = this.tabService.isPinned(tabId);
		const titlebar = this.tabService.getTitleBarView();
		return [
			{
				label: isPinned ? 'Unpin Tab' : 'Pin Tab',
				click: () => {
					this.tabService.togglePinTab(tabId, !isPinned);
					titlebar.webContents.send('context-menu-command', {
						id: 'pin',
						tabId,
					});
				},
			},
			{ type: 'separator' },
			{
				label: 'Close Tab',
				accelerator: shortcutMap.tabClose.accelerator,
				click: () => {
					titlebar.webContents.send('context-menu-command', {
						id: 'close',
						tabId,
					});
				},
			},
			{
				label: 'Close Other Tabs',
				click: () => {
					titlebar.webContents.send('context-menu-command', {
						id: 'closeOther',
						tabIds: this.tabService
							.getTabIds()
							.filter((id) => id !== tabId && !this.tabService.isPinned(id)),
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
					this.tabService.duplicateTab(tabId);
				},
				enabled: Boolean(view),
			},
			{ type: 'separator' },
			{
				label: 'Zoom In',
				accelerator: shortcutMap.zoomIn.accelerator,
				click: () => this.tabService.runAction('zoomIn'),
			},
			{
				label: 'Zoom Out',
				accelerator: shortcutMap.zoomOut.accelerator,
				click: () => this.tabService.runAction('zoomOut'),
			},
			{
				label: 'Reset Zoom',
				accelerator: shortcutMap.zoomReset.accelerator,
				click: () => this.tabService.runAction('zoomReset'),
			},
			{ type: 'separator' },
			{
				label: 'Reload',
				accelerator: shortcutMap.pageReload.accelerator,
				click: () => this.tabService.runAction('pageReload'),
			},
			{
				label: 'Back',
				accelerator: shortcutMap.historyBack.accelerator,
				click: () => this.tabService.runAction('historyBack'),
				enabled: Boolean(view?.webContents?.navigationHistory.canGoBack()),
			},
			{
				label: 'Forward',
				accelerator: shortcutMap.historyForward.accelerator,
				click: () => this.tabService.runAction('historyForward'),
				enabled: Boolean(view?.webContents?.navigationHistory.canGoForward()),
			},
			{ type: 'separator' },
			{
				label: 'Copy URL',
				click: () => {
					clipboard.writeText(view?.webContents?.getURL() ?? '');
				},
			},
			{
				label: 'Open in Browser',
				click: () => {
					const url = view?.webContents?.getURL();
					if (url) shell.openExternal(url);
				},
			},
		];
	}

	private templatePageContextMenu(
		wc: WebContents,
		{
			isLink,
			isImage,
			isSelection,
			linkUrl,
			imageUrl,
			misspelledWord,
			dictionarySuggestions,
		}: PageContextMenuPayload,
	): MenuItemConstructorOptions[] {
		const template: MenuItemConstructorOptions[] = [
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
					this.tabService.requestTab({ url: linkUrl });
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

		if ((Array.isArray(dictionarySuggestions) && dictionarySuggestions.length > 0) || misspelledWord) {
			template.unshift({
				type: 'separator',
			});
		}

		if (Array.isArray(dictionarySuggestions) && dictionarySuggestions.length > 0) {
			template.unshift(
				...dictionarySuggestions.map((suggestion) => {
					return {
						label: `Replace to "${suggestion}"`,
						click: () => {
							wc.replaceMisspelling(suggestion);
						},
					};
				}),
			);
		}

		if (misspelledWord) {
			template.unshift({
				label: `Add "${misspelledWord}" to dictionary`,
				click: () => {
					wc.session.addWordToSpellCheckerDictionary(misspelledWord);
				},
			});
		}

		return template;
	}

	private templateAllTabsContextMenu(tabs: string[]): MenuItemConstructorOptions[] {
		const dir = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
		const defaultIcon = nativeImage
			.createFromPath(resolveAsset(`icons/${dir}/document.png`))
			.resize({ width: 16, height: 16 });
		return tabs.map((id): MenuItemConstructorOptions => {
			const storedIcon = this.tabService.getTabIcon(id);
			const icon =
				storedIcon && !storedIcon.includes('favicon.ico')
					? nativeImage.createFromDataURL(storedIcon).resize({ width: 16, height: 16 })
					: defaultIcon;
			return {
				label: (this.tabService.getTabTitle(id) ?? 'New Tab') + (this.tabService.isPinned(id) ? ' 📌' : ''),
				click: () => {
					this.tabService.requestTab({ tabId: id });
				},
				type: 'radio',
				checked: id === this.tabService.getCurrentTabId(),
				icon,
			};
		});
	}
}

export default ContextMenuService;
