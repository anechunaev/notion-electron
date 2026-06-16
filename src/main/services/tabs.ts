import { WebContentsView, ipcMain, app, type BaseWindow, type KeyboardInputEvent } from 'electron';
import type EventEmitter from 'node:events';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { convertIcon, selectFavicon } from '../lib/image';
import { detectShortcut, shortcutMap } from '../lib/shortcuts/index';
import { resolvePreload, loadRendererPage } from '../lib/resources';
import { resolveWindowOpen } from '../lib/windowOpenPolicy';
import { APP_DEFINITIONS, createAppMap, getAppFromUrl, getAppHomeUrl } from '../../shared/apps';
import TabLayout from './tabLayout';
import TabPersistence from './tabPersistence';
import type { AppName, AppStore, OptionValues } from '../types';
import type { TabCommands, TabReader, TabRequestOptions } from './tabs.types';
import type { TabsStatePayload, TabState } from '../../shared/ipc';
import type OptionsService from './options';
import pkg from '../../../package.json';

export type { TabRequestOptions } from './tabs.types';

const HOME_PAGE = getAppHomeUrl('notes');

const PINNED_APP_OPTIONS: Partial<Record<AppName, keyof OptionValues>> = {
	calendar: 'tabs-show-calendar',
	mail: 'tabs-show-mail',
};
const USER_AGENT = `Mozilla/5.0 (${process.env.XDG_SESSION_TYPE ?? 'X11'}; Linux ${process.arch}) Notion_Еlectron/${pkg.version} Chrome/${process.versions.chrome}`;

async function sendKey(
	entry: { keyCode: string; modifiers?: string[] },
	delay: number,
	view: WebContentsView | undefined,
): Promise<void> {
	if (!view) return;
	await (['keyDown', 'char', 'keyUp'] as const).reduce(
		(chain, keyType) =>
			chain.then(async () => {
				view.webContents.sendInputEvent({ ...entry, type: keyType } as KeyboardInputEvent);
				await new Promise<void>((resolve) => {
					setTimeout(resolve, delay);
				});
			}),
		Promise.resolve(),
	);
}

class TabsService implements TabReader, TabCommands {
	private tabViews: Record<string, WebContentsView> = {};
	private tabOrder: string[] = [];
	private tabApp: Record<string, AppName> = {};
	private pinnedMap: Record<string, boolean> = {};
	private iconMap: Record<string, string> = {};
	private titlesMap: Record<string, string> = {};
	private titleBarView: WebContentsView;
	private window: BaseWindow;
	private currentTabId: string | null = null;
	private options: OptionsService;
	private persistence: TabPersistence;
	private layout: TabLayout;
	private mainBus: EventEmitter;

	constructor(window: BaseWindow, optionsService: OptionsService, store: AppStore, mainBus: EventEmitter) {
		this.window = window;
		this.options = optionsService;
		this.persistence = new TabPersistence(store, optionsService);
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
		this.layout = new TabLayout(this.window, this.titleBarView, store);
		this.currentTabId = this.persistence.getCurrentTabId();

		ipcMain.on('tab-add', (event, options: TabRequestOptions) => {
			this.openTab({ url: options.url, app: options.app });
		});

		ipcMain.on('tab-select', (event, tabId: string) => {
			this.selectTab(tabId);
		});

		ipcMain.on('tab-close', (event, tabId: string) => {
			this.closeTab(tabId);
		});

		ipcMain.on('tab-close-current', () => {
			this.closeCurrentTab();
		});

		ipcMain.on('tab-close-others', (event, tabId: string) => {
			this.closeOthers(tabId);
		});

		ipcMain.on('tab-close-all', () => {
			this.closeAll();
		});

		ipcMain.on('tab-next', () => {
			this.nextTab();
		});

		ipcMain.on('tab-previous', () => {
			this.previousTab();
		});

		ipcMain.on('tab-reorder', (event, pinnedIds: string[], normalIds: string[]) => {
			this.reorderTabs(pinnedIds, normalIds);
		});

		ipcMain.on('history-back', () => {
			this.currentView()?.webContents.goBack();
		});

		ipcMain.on('history-forward', () => {
			this.currentView()?.webContents.goForward();
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

			const tabId = this.tabOrder.find((id) => this.tabViews[id]?.webContents === event.sender);

			loadRendererPage(event.sender, 'offline', {
				next: tabId ? (this.tabViews[tabId]?.webContents.getURL() ?? '') : '',
			});
		});

		ipcMain.on('titlebar-ready', () => {
			this.initTabs();
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

		this.window.on('maximize', () => {
			this.layout.setMaximized(true);
			this.setViewSize();
		});

		this.window.on('unmaximize', () => {
			this.layout.setMaximized(false);
			this.setViewSize();
		});

		app.on('before-quit', () => {
			this.saveTabs();
		});
	}

	private initTabs(): void {
		if (this.options.getOption('debug-open-dev-tools')) {
			this.titleBarView.webContents.openDevTools({ mode: 'detach' });
		}

		if (this.options.getOption('tabs-reopen-on-start')) {
			this.reopenTabs(this.persistence.getSavedTabs());
		} else {
			this.openTab({ url: HOME_PAGE, app: 'notes' });
		}

		APP_DEFINITIONS.filter((definition) => definition.isPinnedByDefault).forEach((definition) => {
			const optionId = PINNED_APP_OPTIONS[definition.id];
			if (optionId && this.options.getOption(optionId)) {
				this.openTab({ url: definition.homeUrl, isPinned: true, app: definition.id, skipChange: true });
			}
		});

		if (this.currentTabId && this.tabViews[this.currentTabId]) {
			this.setVisibleTabs(this.currentTabId);
		} else {
			const first = this.tabOrder[0];
			if (first) {
				this.setVisibleTabs(first);
			}
		}

		this.setViewSize();
		this.pushState();
	}

	private currentView(): WebContentsView | undefined {
		return this.currentTabId ? this.tabViews[this.currentTabId] : undefined;
	}

	private setViewSize(): void {
		this.layout.layout(Object.values(this.tabViews));
	}

	private pushState(): void {
		const tabs: TabState[] = this.tabOrder.map((id) => ({
			id,
			app: this.tabApp[id] ?? 'notes',
			url: this.tabViews[id]?.webContents.getURL(),
			title: this.titlesMap[id] ?? null,
			icon: this.iconMap[id] ?? null,
			pinned: Boolean(this.pinnedMap[id]),
		}));
		const current = this.currentView();
		const payload: TabsStatePayload = {
			tabs,
			currentTabId: this.currentTabId,
			canGoBack: Boolean(current?.webContents?.navigationHistory.canGoBack()),
			canGoForward: Boolean(current?.webContents?.navigationHistory.canGoForward()),
		};
		this.titleBarView.webContents.send('tabs-state', payload);
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

	private selectTab(tabId: string): void {
		if (!this.tabViews[tabId]) return;
		this.setVisibleTabs(tabId);
		this.saveTabs();
		this.pushState();
	}

	private revealTab(tabId: string, skipChange: boolean): void {
		if (skipChange) this.pushState();
		else this.selectTab(tabId);
	}

	private findExistingTarget(tabId: string | undefined, app: AppName | undefined): string | undefined {
		if (tabId && this.tabViews[tabId]) return tabId;
		if (!tabId && app) {
			return this.tabOrder.find((id) => this.tabApp[id] === app && this.tabViews[id]);
		}
		return undefined;
	}

	private openTab({ tabId, url, app, isPinned = false, skipChange = false }: TabRequestOptions): void {
		const existing = this.findExistingTarget(tabId, app);
		if (existing) {
			this.revealTab(existing, skipChange);
			return;
		}

		const id = tabId ?? randomUUID();
		this.createTabView(id, url, app, isPinned);
		this.revealTab(id, skipChange);
	}

	private createTabView(tabId: string, url: string | undefined, app: AppName | undefined, isPinned: boolean): void {
		const view = new WebContentsView({
			webPreferences: {
				preload: resolvePreload('docs.cjs'),
				spellcheck: this.options.getOption('general-enable-spellcheck'),
			},
		});

		if (this.options.getOption('debug-open-dev-tools')) {
			view.webContents.openDevTools({ mode: 'detach' });
		}

		view.setBounds(this.layout.contentBounds());

		view.webContents
			.loadURL(url ?? HOME_PAGE, {
				userAgent: USER_AGENT,
			})
			.then(() => {
				this.saveTabs();
				if (this.currentTabId === tabId) {
					this.setVisibleTabs(tabId);
				}
				this.pushState();
			});
		view.webContents.setWindowOpenHandler((event) => {
			return resolveWindowOpen(event.url, event.disposition, (tabUrl) => this.openTab({ url: tabUrl }));
		});

		view.webContents.on('page-title-updated', (_event, title) => {
			if (!title || !this.tabViews[tabId]) return;
			this.titlesMap[tabId] = title;
			this.sendTabInfo(tabId, { title, icon: null });
			this.saveTabs();
		});

		view.webContents.on('page-favicon-updated', (_event, favicons) => {
			const iconUrl = selectFavicon(this.tabApp[tabId] ?? 'notes', favicons);
			if (!iconUrl) return;
			convertIcon(iconUrl).then((convertedIcon) => {
				if (!convertedIcon || !this.tabViews[tabId]) return;
				this.iconMap[tabId] = convertedIcon;
				this.sendTabInfo(tabId, { title: null, icon: convertedIcon });
			});
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
		this.tabApp[tabId] = app ?? getAppFromUrl(url ?? HOME_PAGE);
		this.tabOrder.push(tabId);
	}

	private destroyTab(tabId: string): void {
		const view = this.tabViews[tabId];
		if (view) {
			view.webContents?.close();
		}
		delete this.tabViews[tabId];
		delete this.iconMap[tabId];
		delete this.titlesMap[tabId];
		delete this.pinnedMap[tabId];
		delete this.tabApp[tabId];
		this.tabOrder = this.tabOrder.filter((id) => id !== tabId);
	}

	public closeTab(tabId: string): void {
		if (!this.tabViews[tabId]) return;
		if (this.tabOrder.length === 1) {
			this.setTabUrl(tabId, '/login');
			return;
		}
		const index = this.tabOrder.indexOf(tabId);
		this.destroyTab(tabId);
		const nextIndex = index - 1 < 0 ? 0 : index - 1;
		const nextId = this.tabOrder[nextIndex];
		if (nextId) {
			this.selectTab(nextId);
		} else {
			this.saveTabs();
			this.pushState();
		}
	}

	private closeCurrentTab(): void {
		if (this.currentTabId) {
			this.closeTab(this.currentTabId);
		}
	}

	public closeOthers(tabId: string): void {
		this.tabOrder
			.filter((id) => id !== tabId && !this.pinnedMap[id])
			.forEach((id) => {
				this.destroyTab(id);
			});
		this.selectTab(tabId);
	}

	public closeAll(): void {
		if (this.tabOrder.length === 1) {
			const only = this.tabOrder[0];
			if (only) this.closeTab(only);
			return;
		}

		this.tabOrder
			.filter((id) => !this.pinnedMap[id])
			.forEach((id) => {
				this.destroyTab(id);
			});

		const first = this.tabOrder[0];
		if (!first) {
			this.openTab({ url: HOME_PAGE, app: 'notes' });
		} else {
			this.selectTab(first);
		}
	}

	private closeTabsByApp(appName: AppName): void {
		this.tabOrder
			.filter((id) => this.tabApp[id] === appName)
			.forEach((id) => {
				this.destroyTab(id);
			});
		if (this.currentTabId && !this.tabViews[this.currentTabId]) {
			const fallback = this.tabOrder[this.tabOrder.length - 1];
			this.currentTabId = fallback ?? null;
			if (fallback) this.setVisibleTabs(fallback);
		}
		this.saveTabs();
		this.pushState();
	}

	private nextTab(): void {
		if (!this.currentTabId) return;
		const index = this.tabOrder.indexOf(this.currentTabId);
		if (index < 0) return;
		const nextIndex = index + 1 >= this.tabOrder.length ? 0 : index + 1;
		const nextId = this.tabOrder[nextIndex];
		if (nextId) this.selectTab(nextId);
	}

	private previousTab(): void {
		if (!this.currentTabId) return;
		const index = this.tabOrder.indexOf(this.currentTabId);
		if (index < 0) return;
		const prevIndex = index - 1 < 0 ? this.tabOrder.length - 1 : index - 1;
		const prevId = this.tabOrder[prevIndex];
		if (prevId) this.selectTab(prevId);
	}

	private reorderTabs(pinnedIds: string[], normalIds: string[]): void {
		const ordered = [...pinnedIds, ...normalIds].filter((id) => this.tabViews[id]);
		const pinnedSet = new Set(pinnedIds);
		this.tabOrder = ordered;
		ordered.forEach((id) => {
			this.pinnedMap[id] = pinnedSet.has(id);
		});
		this.saveTabs();
		this.pushState();
	}

	private setTabUrl(tabId: string, url: string): void {
		const view = this.tabViews[tabId];
		if (view) {
			const fullUrl = new URL(url, view.webContents.getURL()).toString();
			view.webContents.loadURL(fullUrl.toString());
		}
	}

	private sendTabInfo(tabId: string, { title, icon }: { title: string | null; icon: string | null }): void {
		const view = this.tabViews[tabId];
		if (!view) return;
		this.titleBarView.webContents.send('tab-info', tabId, {
			title,
			icon,
			documentUrl: view.webContents?.getURL(),
			canGoBack: Boolean(view.webContents?.navigationHistory.canGoBack()),
			canGoForward: Boolean(view.webContents?.navigationHistory.canGoForward()),
		});
	}

	public getTabView(tabId: string): WebContentsView | undefined {
		return this.tabViews[tabId];
	}

	public getTitleBarView(): WebContentsView {
		return this.titleBarView;
	}

	public getTabIds(): string[] {
		return [...this.tabOrder];
	}

	public duplicateTab(tabId: string): void {
		this.openTab({ url: this.tabViews[tabId]?.webContents.getURL() });
	}

	public requestTab(options: TabRequestOptions): void {
		this.openTab(options);
	}

	private getTabsJSON(): Record<string, string> {
		return this.tabOrder.reduce<Record<string, string>>((acc, tabId) => {
			const url = this.tabViews[tabId]?.webContents?.getURL();
			if (url) {
				acc[tabId] = url;
			}
			return acc;
		}, {});
	}

	private reopenTabs(tabs: Record<string, string>): void {
		const titles = this.persistence.getSavedTitles();
		Object.entries(tabs).forEach(([tabId, url]) => {
			const isPinned = this.persistence.isPinned(tabId);
			const app = this.persistence.getAppForTab(tabId);
			this.openTab({ url, tabId, isPinned, app, skipChange: true });
			const savedTitle = titles[tabId];
			if (savedTitle) {
				this.titlesMap[tabId] = savedTitle;
			}
		});
	}

	private saveTabs(): void {
		const appMap = createAppMap<string[]>(() => []);
		this.tabOrder.forEach((id) => {
			appMap[this.tabApp[id] ?? 'notes'].push(id);
		});

		const titles = this.tabOrder.reduce<Record<string, string>>((acc, tabId) => {
			const title = this.titlesMap[tabId];
			if (title) {
				acc[tabId] = title;
			}
			return acc;
		}, {});

		this.persistence.save({
			tabs: this.getTabsJSON(),
			titles,
			currentTabId: this.currentTabId,
			pinned: this.pinnedMap,
			apps: appMap,
		});
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
		if (!this.tabViews[tabId]) return;
		this.pinnedMap[tabId] = isPinned;
		this.tabOrder = this.tabOrder.filter((id) => id !== tabId);
		this.tabOrder.push(tabId);
		this.saveTabs();
		this.pushState();
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
