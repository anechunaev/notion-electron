import { WebContentsView, ipcMain, shell } from 'electron';
import { URL, fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TITLEBAR_HEIGHT = 44;

class TabsService {
	#tabViews = {};
	#calendarView = null;
	#titleBarView = null;
	#window = null;
	#currentTabId = null;

	constructor(window) {
		this.#window = window;

		this.#titleBarView = new WebContentsView({
			webPreferences: {
				preload: path.join(__dirname, '../render/tab-preload.js'),
			},
		});
		this.#titleBarView.webContents.loadFile('./assets/pages/titlebar.html');
		this.#window.contentView.addChildView(this.#titleBarView);

		this.#calendarView = new WebContentsView();
		this.#calendarView.webContents.loadURL('https://calendar.notion.so/notion-auth');

		ipcMain.on('add-tab', (event, tabId, loadUrl) => {
			this.#addTab(tabId, loadUrl);
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

		ipcMain.on('sidebar-changed', (event, collapsed, width) => {
			this.#titleBarView.webContents.send('sidebar-changed', collapsed, width);
		});

		ipcMain.on('sidebar-fold', (event, collapsed) => {
			this.#tabViews[this.#currentTabId].webContents.send('sidebar-fold', collapsed);
		});

		ipcMain.on('toggle-sidebar', () => {
			this.sendKey({ keyCode: '\\', modifiers: ['Ctrl']}, 50, this.#tabViews[this.#currentTabId]);
		});

		this.#window.on('closed', () => {
			Object.values(this.#tabViews).forEach((view) => view.webContents.close());
		});

		this.#window.on('resize', this.#setViewSize.bind(this));

		this.#setViewSize();
		this.#setVisibleTabs();

		// this.#titleBarView.webContents.openDevTools({ mode: 'detach' });
	}

	#setViewSize() {
		const bounds = this.#window.getBounds();
		this.#titleBarView.setBounds({ x: 0, y: 0, width: bounds.width, height: TITLEBAR_HEIGHT });
		Object.values(this.#tabViews).forEach((view) => {
			view.setBounds({ x: 0, y: TITLEBAR_HEIGHT, width: bounds.width, height: bounds.height - TITLEBAR_HEIGHT });
		});
		this.#calendarView.setBounds({ x: 0, y: TITLEBAR_HEIGHT, width: bounds.width, height: bounds.height - TITLEBAR_HEIGHT });
	}
	
	#setVisibleTabs(tabId) {
		Object.entries(this.#tabViews).forEach(([viewId, view]) => {
			const visible = viewId === tabId;
			if (visible) {
				this.#window.contentView.addChildView(view);
				this.#window.contentView.removeChildView(this.#calendarView);
			} else {
				this.#window.contentView.removeChildView(view);
			}
		});
		
		if (!tabId) {
			this.#window.contentView.addChildView(this.#calendarView);
		}

		this.#currentTabId = tabId;
	}

	#addTab(tabId, loadUrl) {
		const view = new WebContentsView({
			webPreferences: {
				preload: path.join(__dirname, '../render/docs-preload.js'),
			},
		});
		// view.webContents.openDevTools({ mode: 'detach' });
		const bounds = this.#window.getBounds();
		view.setBounds({ x: 0, y: TITLEBAR_HEIGHT, width: bounds.width, height: bounds.height - TITLEBAR_HEIGHT });
		view.webContents.loadURL(loadUrl ?? 'https://www.notion.com/login');
		view.webContents.setWindowOpenHandler((event) => {
			const { url, disposition } = event;
			return this.#tabOpenWindowHandler(url, disposition);
		});
		this.#tabViews[tabId] = view;
	}

	#tabOpenWindowHandler(url, disposition) {
		const u = new URL(url);
	
		if (u.hostname === 'www.notion.com' || u.hostname === 'www.notion.so') {
			if (disposition === 'new-window' || disposition === 'foreground-tab' || disposition === 'background-tab') {
				this.#titleBarView.webContents.send('tab-request', u.toString());
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
			canGoBack: view ? view.webContents.navigationHistory.canGoBack() : false,
			canGoForward: view ? view.webContents.navigationHistory.canGoForward() : false,
		});
	}

	#onCloseTab(tabId) {
		const view = this.#tabViews[tabId];
		if (view) {
			view.webContents.close();
			delete this.#tabViews[tabId];
		}
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
				canGoBack: view.webContents.navigationHistory.canGoBack(),
				canGoForward: view.webContents.navigationHistory.canGoForward(),
			});
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
		this.#titleBarView.webContents.send('tab-request', this.#tabViews[tabId].webContents.getURL());
	}

	requestTab(url) {
		this.#titleBarView.webContents.send('tab-request', url);
	}
}

export default TabsService;
