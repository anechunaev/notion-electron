import {
	WebContentsView,
	ipcMain,
	shell,
	app,
	type BaseWindow,
	type WebContents,
	type KeyboardInputEvent,
	type WindowOpenHandlerResponse,
} from 'electron';
import type EventEmitter from 'node:events';
import { URL } from 'node:url';
import { convertIcon } from '../lib/image';
import { detectShortcut, shortcutMap } from '../lib/shortcuts/index';
import { resolvePreload, loadRendererPage } from '../lib/resources';
import type { AppName, AppStore, TabAppMap } from '../types';
import type OptionsService from './options';
import pkg from '../../../package.json';

const TITLEBAR_HEIGHT = 40;
const HOME_PAGE = 'https://www.notion.com/login';
const CALENDAR_PAGE = 'https://calendar.notion.so';
const MAIL_PAGE = 'https://mail.notion.com';
const AUTH_HOSTS = ['notion.so', 'notion.com', 'google.com', 'live.com', 'microsoft.com', 'apple.com'];
const USER_AGENT = `Mozilla/5.0 (${process.env.XDG_SESSION_TYPE ?? 'X11'}; Linux ${process.arch}) Notion_Еlectron/${pkg.version} Chrome/${process.versions.chrome}`;

export interface TabRequestOptions {
	tabId?: string;
	url?: string;
	isPinned?: boolean;
	app?: AppName;
	skipChange?: boolean;
}

function sendKey(
	entry: { keyCode: string; modifiers?: string[] },
	delay: number,
	view: WebContentsView | undefined,
): void {
	if (!view) return;
	(['keyDown', 'char', 'keyUp'] as const).forEach(async (type) => {
		const keyEntry = {
			...entry,
			type,
		};
		view.webContents.sendInputEvent(keyEntry as KeyboardInputEvent);

		await new Promise<void>((resolve) => {
			setTimeout(resolve, delay);
		});
	});
}

class TabsService {
	private tabViews: Record<string, WebContentsView> = {};
	private tabAppMap: TabAppMap = {
		notes: [],
		calendar: [],
		mail: [],
	};
	private iconMap: Record<string, string> = {};
	private titlesMap: Record<string, string> = {};
	private pinnedMap: Record<string, boolean> = {};
	private titleBarView: WebContentsView;
	private window: BaseWindow;
	private currentTabId: string | null = null;
	private options: OptionsService;
	private store: AppStore;
	private mainBus: EventEmitter;

	constructor(window: BaseWindow, optionsService: OptionsService, store: AppStore, mainBus: EventEmitter) {
		this.window = window;
		this.options = optionsService;
		this.store = store;
		this.mainBus = mainBus;

		this.mainBus.on('option-changed', (optionId: string, value: unknown) => {
			if (optionId === 'tabs-show-calendar' && value === false) {
				this.closeTabsByApp('calendar');
			}
			if (optionId === 'tabs-show-mail' && value === false) {
				this.closeTabsByApp('mail');
			}
		});

		this.titleBarView = new WebContentsView({
			webPreferences: {
				preload: resolvePreload('tab.cjs'),
			},
		});
		loadRendererPage(this.titleBarView.webContents, 'titlebar');
		this.titleBarView.webContents.on('before-input-event', (event, input) => {
			detectShortcut(input, event, this.currentView()?.webContents, this.titleBarView.webContents);
		});
		this.window.contentView.addChildView(this.titleBarView);
		this.currentTabId = this.store.get('tab-current', null);

		ipcMain.on('add-tab', (event, options: TabRequestOptions) => {
			this.addTab(options);
		});

		ipcMain.on('change-tab', (event, tabId: string) => {
			this.onChangeTab(tabId);
		});

		ipcMain.on('close-tab', (event, tabId: string) => {
			this.onCloseTab(tabId);
		});

		ipcMain.on('set-url', (event, tabId: string, url: string) => {
			this.setTabUrl(tabId, url);
		});

		ipcMain.on('history-changed', (event, title: string | null, icon: string | null) => {
			this.onHistoryChanged(event.sender, title, icon);
		});

		ipcMain.on('history-back', () => {
			this.currentView()?.webContents.goBack();
		});

		ipcMain.on('history-forward', () => {
			this.currentView()?.webContents.goForward();
		});

		ipcMain.on('tab-pin-toggle', (event, tabId: string, isPinned: boolean) => {
			this.togglePinTab(tabId, isPinned);
		});

		if (this.options.getOption('tabs-continue-sidebar')) {
			ipcMain.on('sidebar-changed', (event, collapsed: boolean, width: string) => {
				this.titleBarView.webContents.send('sidebar-changed', collapsed, width);
			});

			ipcMain.on('sidebar-fold', (event, collapsed: boolean) => {
				const currentViewWebContents = this.currentView()?.webContents;
				if (currentViewWebContents) {
					currentViewWebContents.send('sidebar-fold', collapsed);
				}
			});

			ipcMain.on('sidebar-folding-stop', () => {
				this.titleBarView.webContents.send('sidebar-folding-stop');
			});

			ipcMain.on('toggle-sidebar', () => {
				sendKey({ keyCode: '\\', modifiers: ['Ctrl'] }, 50, this.currentView());
			});

			ipcMain.on('request-sidebar-data', () => {
				const currentViewWebContents = this.currentView()?.webContents;
				if (currentViewWebContents) {
					currentViewWebContents.send('request-sidebar-data');
				}
			});
		}

		ipcMain.on('request-options', (event) => {
			const options = {
				initialTabId: this.currentTabId,
				sidebarContinueToTitlebar: this.options.getOption('tabs-continue-sidebar'),
			};
			event.sender.send('global-options', options);
		});

		ipcMain.on('show-offline-screen', (event, { isLocal }: { isLocal: boolean }) => {
			if (isLocal) return;

			const tabId = this.getTabIds().find((id) => this.tabViews[id]?.webContents === event.sender);

			loadRendererPage(event.sender, 'offline', {
				next: tabId ? (this.tabViews[tabId]?.webContents.getURL() ?? '') : '',
			});
		});

		ipcMain.on('titlebar-ready', () => {
			if (this.options.getOption('debug-open-dev-tools')) {
				this.titleBarView.webContents.openDevTools({ mode: 'detach' });
			}

			if (this.options.getOption('tabs-reopen-on-start')) {
				this.reopenTabs(this.store.get('tabs', {}));
			} else {
				this.requestTab({ url: HOME_PAGE, app: 'notes' });
			}

			if (this.options.getOption('tabs-show-calendar')) {
				this.requestTab({
					url: CALENDAR_PAGE,
					isPinned: true,
					app: 'calendar',
					skipChange: true,
				});
			}

			if (this.options.getOption('tabs-show-mail')) {
				this.requestTab({
					url: MAIL_PAGE,
					isPinned: true,
					app: 'mail',
					skipChange: true,
				});
			}

			this.setViewSize();
		});

		ipcMain.on('run-action', (event, actionName: string) => {
			this.runAction(actionName);
		});

		this.window.on('closed', () => {
			Object.values(this.tabViews).forEach((view) => {
				view.webContents.close();
			});
		});

		this.window.on('resize', this.setViewSize.bind(this));

		app.on('before-quit', () => {
			this.saveTabs();
		});
	}

	private currentView(): WebContentsView | undefined {
		return this.currentTabId ? this.tabViews[this.currentTabId] : undefined;
	}

	private getAppFromUrl(url: string): AppName {
		const u = new URL(url);
		if (u.pathname.startsWith('/calendarAuth')) {
			return 'calendar';
		}
		switch (u.hostname) {
			case 'calendar.notion.so':
				return 'calendar';
			case 'mail.notion.so':
				return 'mail';
			default:
				return 'notes';
		}
	}

	private setViewSize(): void {
		const bounds = this.window.getContentBounds();
		this.titleBarView.setBounds({
			x: 0,
			y: 0,
			width: bounds.width,
			height: TITLEBAR_HEIGHT,
		});
		Object.values(this.tabViews).forEach((view) => {
			view.setBounds({
				x: 0,
				y: TITLEBAR_HEIGHT,
				width: bounds.width,
				height: bounds.height - TITLEBAR_HEIGHT,
			});
		});
	}

	private closeTabsByApp(appName: AppName): void {
		const tabIds = this.tabAppMap[appName] || [];
		[...tabIds].forEach((tabId) => {
			this.onCloseTab(tabId);
		});
	}

	private setVisibleTabs(tabId: string): void {
		Object.entries(this.tabViews).forEach(([viewId, view]) => {
			const visible = viewId === tabId;
			if (visible && view) {
				this.window.contentView.addChildView(view);
			} else {
				this.window.contentView.removeChildView(view);
			}
		});

		this.currentTabId = tabId;
	}

	private addTab({ tabId, url, isPinned = false, app }: TabRequestOptions): void {
		if (!tabId) return;
		const view = new WebContentsView({
			webPreferences: {
				preload: resolvePreload('docs.cjs'),
				spellcheck: this.options.getOption('general-enable-spellcheck'),
			},
		});

		if (this.options.getOption('debug-open-dev-tools')) {
			view.webContents.openDevTools({ mode: 'detach' });
		}

		const bounds = this.window.getContentBounds();
		view.setBounds({
			x: 0,
			y: TITLEBAR_HEIGHT,
			width: bounds.width,
			height: bounds.height - TITLEBAR_HEIGHT,
		});

		view.webContents
			.loadURL(url ?? HOME_PAGE, {
				userAgent: USER_AGENT,
			})
			.then(() => {
				this.saveTabs();
				if (this.currentTabId === tabId) {
					this.setVisibleTabs(tabId);
				}
			});
		view.webContents.setWindowOpenHandler((event) => {
			const { url, disposition } = event;
			return this.tabOpenWindowHandler(url, disposition);
		});

		view.webContents.on('before-input-event', (event, input) => {
			detectShortcut(input, event, view.webContents, this.titleBarView.webContents);
		});

		view.webContents.on('context-menu', (event, params) => {
			this.mainBus.emit('show-page-context-menu', {
				sender: view.webContents,
				isLink: Boolean(params.linkURL),
				isImage: params.mediaType === 'image' && Boolean(params.srcURL),
				linkUrl: params.linkURL,
				imageUrl: params.srcURL,
				isSelection: Boolean(params.selectionText),
				misspelledWord: params.misspelledWord,
				dictionarySuggestions: params.dictionarySuggestions,
			});
		});

		this.tabViews[tabId] = view;
		this.pinnedMap[tabId] = isPinned;
		this.tabAppMap[app ?? this.getAppFromUrl(url ?? HOME_PAGE)].push(tabId);
	}

	private tabOpenWindowHandler(url: string, disposition: string): WindowOpenHandlerResponse {
		const u = new URL(url);

		const isAuthHost = AUTH_HOSTS.some((host) => u.hostname.includes(host));

		if (isAuthHost && disposition === 'new-window') {
			return {
				action: 'allow',
				overrideBrowserWindowOptions: {
					width: 520,
					height: 760,
					show: true,
					autoHideMenuBar: true,
					webPreferences: {
						sandbox: true,
						contextIsolation: true,
						nodeIntegration: false,
					},
				},
			};
		}

		if (u.hostname.includes('notion.com') || u.hostname.includes('notion.so')) {
			if (disposition === 'new-window' || disposition === 'foreground-tab' || disposition === 'background-tab') {
				this.titleBarView.webContents.send('tab-request', {
					url: u.toString(),
				});
				return { action: 'deny' };
			}
			return { action: 'allow' };
		}

		shell.openExternal(url);
		return { action: 'deny' };
	}

	private onChangeTab(tabId: string): void {
		const view = this.currentView();
		this.titleBarView.webContents.send('tab-info', tabId, {
			title: null,
			icon: null,
			documentUrl: view?.webContents?.getURL(),
			canGoBack: Boolean(view?.webContents?.navigationHistory.canGoBack()),
			canGoForward: Boolean(view?.webContents?.navigationHistory.canGoForward()),
		});
		this.setVisibleTabs(tabId);
	}

	private onCloseTab(tabId: string): void {
		const view = this.tabViews[tabId];
		if (view) {
			view.webContents?.close();
			delete this.tabViews[tabId];
			delete this.iconMap[tabId];
			delete this.titlesMap[tabId];
			delete this.pinnedMap[tabId];

			(Object.entries(this.tabAppMap) as [AppName, string[]][]).forEach(([appName, tabIds]) => {
				this.tabAppMap[appName] = tabIds.filter((id) => id !== tabId);
			});
		}
		this.saveTabs();
	}

	private setTabUrl(tabId: string, url: string): void {
		const view = this.tabViews[tabId];
		if (view) {
			const fullUrl = new URL(url, view.webContents.getURL()).toString();
			view.webContents.loadURL(fullUrl.toString());
		}
	}

	private onHistoryChanged(sender: WebContents, title: string | null, icon: string | null): void {
		const tabId = Object.keys(this.tabViews).find((id) => this.tabViews[id]?.webContents === sender);

		if (tabId) {
			const view = this.tabViews[tabId];
			if (!view) return;

			if (icon) {
				convertIcon(icon).then((convertedIcon) => {
					if (!convertedIcon) return;
					this.titleBarView.webContents.send('tab-info', tabId, {
						title: null,
						icon: convertedIcon,
						documentUrl: view.webContents?.getURL(),
						canGoBack: Boolean(view?.webContents?.navigationHistory.canGoBack()),
						canGoForward: Boolean(view?.webContents?.navigationHistory.canGoForward()),
					});
					this.iconMap[tabId] = convertedIcon;
				});
			}
			if (title) {
				this.titleBarView.webContents.send('tab-info', tabId, {
					title,
					icon: null,
					documentUrl: view.webContents?.getURL(),
					canGoBack: Boolean(view?.webContents?.navigationHistory.canGoBack()),
					canGoForward: Boolean(view?.webContents?.navigationHistory.canGoForward()),
				});
				this.titlesMap[tabId] = title;
			}
		}
	}

	public getTabView(tabId: string): WebContentsView | undefined {
		return this.tabViews[tabId];
	}

	public getTitleBarView(): WebContentsView {
		return this.titleBarView;
	}

	public getTabIds(): string[] {
		return Object.keys(this.tabViews);
	}

	public duplicateTab(tabId: string): void {
		this.titleBarView.webContents.send('tab-request', {
			url: this.tabViews[tabId]?.webContents.getURL(),
		});
	}

	public requestTab(options: TabRequestOptions): void {
		this.titleBarView.webContents.send('tab-request', options);
	}

	public getTabsJSON(): Record<string, string> {
		return Object.keys(this.tabViews).reduce<Record<string, string>>((acc, tabId) => {
			const view = this.tabViews[tabId];
			const url = view?.webContents?.getURL();
			if (url) {
				acc[tabId] = url;
			}
			return acc;
		}, {});
	}

	private reopenTabs(tabs: Record<string, string>): void {
		Object.entries(tabs).forEach(([tabId, url]) => {
			const isPinned = this.store.get('tabs-pinned', {})[tabId] ?? false;
			const apps = this.store.get('tab-apps', {
				notes: [],
				calendar: [],
				mail: [],
			});
			let app: AppName = 'notes';
			(Object.entries(apps) as [AppName, string[]][]).forEach(([appName, tabIds]) => {
				if (tabIds.includes(tabId)) {
					app = appName;
				}
			});
			this.requestTab({ url, tabId, isPinned, app, skipChange: true });
		});
	}

	private saveTabs(): void {
		if (this.options.getOption('tabs-reopen-on-start')) {
			this.store.set('tabs', this.getTabsJSON());
			this.store.set('tab-current', this.currentTabId);
			this.store.set('tabs-pinned', this.pinnedMap);
			this.store.set('tab-apps', this.tabAppMap);
		}
	}

	public getTabIcon(tabId: string): string | undefined {
		return this.iconMap[tabId];
	}

	public getTabTitle(tabId: string): string | undefined {
		return this.titlesMap[tabId];
	}

	public getCurrentTabId(): string | null {
		return this.currentTabId;
	}

	public togglePinTab(tabId: string, isPinned: boolean): void {
		this.pinnedMap[tabId] = isPinned;
		this.saveTabs();
	}

	public isPinned(tabId: string): boolean {
		return Boolean(this.pinnedMap[tabId]);
	}

	public runAction(actionName: string): void {
		const shortcut = shortcutMap[actionName as keyof typeof shortcutMap];
		if (shortcut) {
			shortcut.action({
				pageWebContents: this.currentView()?.webContents,
				titlebarWebContents: this.titleBarView.webContents,
			});
		}
	}
}

export default TabsService;
