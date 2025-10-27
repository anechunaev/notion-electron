import { WebContentsView, ipcMain, shell, app } from 'electron';
import { URL, fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TITLEBAR_HEIGHT = 40;
const HOME_PAGE = 'https://www.notion.com/login';
const CALENDAR_PAGE = 'https://calendar.notion.so/notion-auth';
const MAIL_PAGE = 'https://mail.notion.so/notion-auth';

class TabsService {
	#tabViews = {};
	#iconMap = {};
	#titlesMap = {};
	#pinnedMap = {};
	#titleBarView = null;
	#window = null;
	#currentTabId = null;
	#options = null;
	#store = null;

	constructor(window, optionsService, store) {
		this.#window = window;
		this.#options = optionsService;
		this.#store = store;

		this.#titleBarView = new WebContentsView({
			webPreferences: {
				preload: path.join(__dirname, '../render/tab-preload.js'),
			},
		});
		this.#titleBarView.webContents.loadFile('./assets/pages/titlebar.html');
		this.#window.contentView.addChildView(this.#titleBarView);

		ipcMain.on('add-tab', (event, options) => {
			this.#addTab(options);
		});

		ipcMain.on('change-tab', (event, tabId) => {
			this.#onChangeTab(tabId);
		});

		ipcMain.on('close-tab', (event, tabId) => {
			this.#onCloseTab(tabId);
		});

		ipcMain.on('set-url', (event, tabId, url) => {
			this.#setTabUrl(tabId, url);
		});

		ipcMain.on('history-changed', (event, title, icon) => {
			this.#onHistoryChanged(event.sender, title, icon);
		});

		ipcMain.on('history-back', (event) => {
			this.#tabViews[this.#currentTabId].webContents.goBack();
		});

		ipcMain.on('history-forward', (event) => {
			this.#tabViews[this.#currentTabId].webContents.goForward();
		});

		ipcMain.on('tab-pin-toggle', (event, tabId, isPinned) => {
			this.togglePinTab(tabId, isPinned);
		});

		if (this.#options.getOption('tabs-continue-sidebar').data) {
			const currentViewWebContents = this.#tabViews[this.#currentTabId]?.webContents;
			ipcMain.on('sidebar-changed', (event, collapsed, width) => {
				this.#titleBarView.webContents.send('sidebar-changed', collapsed, width);
			});

			ipcMain.on('sidebar-fold', (event, collapsed) => {
				if (currentViewWebContents) {
					currentViewWebContents.send('sidebar-fold', collapsed);
				}
			});

			ipcMain.on('toggle-sidebar', () => {
				this.sendKey({ keyCode: '\\', modifiers: ['Ctrl']}, 50, this.#tabViews[this.#currentTabId]);
			});

			ipcMain.on('request-sidebar-data', () => {
				if (currentViewWebContents) {
					currentViewWebContents.send('request-sidebar-data');
				}
			});
		}

		ipcMain.on('request-options', (event) => {
			if (this.#store.get('tabs-reopen-on-start', false)) {
				this.#reopenTabs(this.#store.get('tabs', {}));
			} else {
				this.requestTab({ url: HOME_PAGE });
			}

			// TODO: create app-based tabs
			// if (this.#options.getOption('tabs-show-calendar').data) {
			// 	this.requestTab({ url: CALENDAR_PAGE, isPinned: true });
			// }

			// if (this.#options.getOption('tabs-show-mail').data) {
			// 	this.requestTab({ url: MAIL_PAGE, isPinned: true });
			// }

			const options = {
				sidebarContinueToTitlebar: this.#options.getOption('tabs-continue-sidebar').data,
			};
			event.sender.send('global-options', options);
		});

		this.#window.on('closed', () => {
			Object.values(this.#tabViews).forEach((view) => view.webContents.close());
		});

		this.#window.on('resize', this.#setViewSize.bind(this));

		app.on('before-quit', () => {
			this.#saveTabs();
		});

		this.#setViewSize();
		this.#setVisibleTabs();

		if (this.#options.getOption('debug-open-dev-tools').data) {
			this.#titleBarView.webContents.openDevTools({ mode: 'detach' });
		}
	}

	#setViewSize() {
		const bounds = this.#window.getBounds();
		this.#titleBarView.setBounds({ x: 0, y: 0, width: bounds.width, height: TITLEBAR_HEIGHT });
		Object.values(this.#tabViews).forEach((view) => {
			view.setBounds({ x: 0, y: TITLEBAR_HEIGHT, width: bounds.width, height: bounds.height - TITLEBAR_HEIGHT });
		});
	}
	
	#setVisibleTabs(tabId) {
		Object.entries(this.#tabViews).forEach(([viewId, view]) => {
			const visible = viewId === tabId;
			if (visible) {
				this.#window.contentView.addChildView(view);
			} else {
				this.#window.contentView.removeChildView(view);
			}
		});

		this.#currentTabId = tabId;
	}

	#addTab({ tabId, url, isPinned = false }) {
		const view = new WebContentsView({
			webPreferences: {
				preload: path.join(__dirname, '../render/docs-preload.js'),
			},
		});

		if (this.#options.getOption('debug-open-dev-tools').data) {
			view.webContents.openDevTools({ mode: 'detach' });
		}

		const bounds = this.#window.getBounds();
		view.setBounds({ x: 0, y: TITLEBAR_HEIGHT, width: bounds.width, height: bounds.height - TITLEBAR_HEIGHT });
		view.webContents.loadURL(url ?? HOME_PAGE)
			.then(() => {
				this.#saveTabs();
				this.#tabViews[tabId] = view;
				this.#pinnedMap[tabId] = isPinned;
			});
		view.webContents.setWindowOpenHandler((event) => {
			const { url, disposition } = event;
			return this.#tabOpenWindowHandler(url, disposition);
		});
	}

	#tabOpenWindowHandler(url, disposition) {
		const u = new URL(url);

		if (u.hostname.includes('notion.com') || u.hostname.includes('notion.so')) {
			if (disposition === 'new-window' || disposition === 'foreground-tab' || disposition === 'background-tab') {
				this.#titleBarView.webContents.send('tab-request', { url: u.toString() });
				return { action: 'deny' };
			}
			return {
				action: 'allow',
				closeWithOpener: false,
				overrideBrowserWindowOptions: undefined,
			};
		}

		shell.openExternal(url);
		return { action: 'deny' };
	}

	#onChangeTab(tabId) {
		this.#setVisibleTabs(tabId);
		const view = this.#tabViews[this.#currentTabId];
		this.#titleBarView.webContents.send('tab-info', tabId, {
			title: null,
			icon: null,
			documentUrl: view?.webContents?.getURL(),
			canGoBack: Boolean(view?.webContents?.navigationHistory.canGoBack()),
			canGoForward: Boolean(view?.webContents?.navigationHistory.canGoForward()),
		});
	}

	#onCloseTab(tabId) {
		const view = this.#tabViews[tabId];
		if (view) {
			view.webContents.close();
			delete this.#tabViews[tabId];
			delete this.#iconMap[tabId];
			delete this.#titlesMap[tabId];
		}
		this.#saveTabs();
	}

	#setTabUrl(tabId, url) {
		const view = this.#tabViews[tabId];
		if (view) {
			const fullUrl = new URL(url, view.webContents.getURL()).toString();
			view.webContents.loadURL(fullUrl.toString());
		}
	}

	#onHistoryChanged(sender, title, icon) {
		const tabId = Object.keys(this.#tabViews).find(tabId => {
			return this.#tabViews[tabId].webContents === sender;
		});

		if (tabId) {
			const view = this.#tabViews[tabId];
			this.#titleBarView.webContents.send('tab-info', tabId, {
				title,
				icon,
				documentUrl: view.webContents?.getURL(),
				canGoBack: Boolean(view?.webContents?.navigationHistory.canGoBack()),
				canGoForward: Boolean(view?.webContents?.navigationHistory.canGoForward()),
			});
			this.#iconMap[tabId] = icon;
			this.#titlesMap[tabId] = title;
		}
	}

	sendKey(entry, delay, view) {
		if (!view) return;
		["keyDown", "char", "keyUp"].forEach(async(type) =>
		{
			entry.type = type;
			view.webContents.sendInputEvent(entry);

			await new Promise(resolve => setTimeout(resolve, delay));
		});
	}

	getTabView(tabId) {
		return this.#tabViews[tabId];
	}

	getTitleBarView() {
		return this.#titleBarView;
	}

	getTabIds() {
		return Object.keys(this.#tabViews);
	}

	duplicateTab(tabId) {
		this.#titleBarView.webContents.send('tab-request', { url: this.#tabViews[tabId].webContents.getURL() });
	}

	requestTab(options) {
		this.#titleBarView.webContents.send('tab-request', options);
	}

	getTabsJSON() {
		return Object.keys(this.#tabViews).reduce((acc, tabId) => {
			const view = this.#tabViews[tabId];
			acc[tabId] = view.webContents.getURL();
			return acc;
		}, {});
	}

	#reopenTabs(tabs) {
		Object.entries(tabs).forEach(([tabId, url]) => {
			const isPinned = this.#store.get('tabs-pinned', {})[tabId] ?? false;
			this.requestTab({ url, tabId, isPinned });
		});
	}

	#saveTabs() {
		if (this.#store.get('tabs-reopen-on-start', false)) {
			this.#store.set('tabs', this.getTabsJSON());
			this.#store.set('tabs-pinned', this.#pinnedMap);
		}
	}

	getTabIcon(tabId) {
		return this.#iconMap[tabId];
	}

	getTabTitle(tabId) {
		return this.#titlesMap[tabId];
	}

	getCurrentTabId() {
		return this.#currentTabId;
	}

	togglePinTab(tabId, isPinned) {
		this.#pinnedMap[tabId] = isPinned;
		this.#saveTabs();
	}

	isPinned(tabId) {
		return Boolean(this.#pinnedMap[tabId]);
	}
}

export default TabsService;
