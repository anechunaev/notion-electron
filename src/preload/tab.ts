import { contextBridge, ipcRenderer } from 'electron';
import type { NotionTitlebarAPI } from '../shared/ipc';

const api: NotionTitlebarAPI = {
	selectTab: (tabId) => {
		ipcRenderer.send('tab-select', tabId);
	},
	addTab: (options) => {
		ipcRenderer.send('tab-add', options);
	},
	closeTab: (tabId) => {
		ipcRenderer.send('tab-close', tabId);
	},
	closeCurrentTab: () => {
		ipcRenderer.send('tab-close-current');
	},
	closeOtherTabs: (tabId) => {
		ipcRenderer.send('tab-close-others', tabId);
	},
	closeAllTabs: () => {
		ipcRenderer.send('tab-close-all');
	},
	nextTab: () => {
		ipcRenderer.send('tab-next');
	},
	previousTab: () => {
		ipcRenderer.send('tab-previous');
	},
	reorderTabs: (pinnedIds, normalIds) => {
		ipcRenderer.send('tab-reorder', pinnedIds, normalIds);
	},
	historyBack: () => {
		ipcRenderer.send('history-back');
	},
	historyForward: () => {
		ipcRenderer.send('history-forward');
	},
	foldSidebar: (collapsed) => {
		ipcRenderer.send('sidebar-fold', collapsed);
	},
	toggleSidebar: () => {
		ipcRenderer.send('toggle-sidebar');
	},
	showContextMenu: (tabId) => {
		ipcRenderer.send('show-tab-context-menu', tabId);
	},
	requestGlobalOptions: () => {
		ipcRenderer.send('request-options');
	},
	requestSidebarData: () => {
		ipcRenderer.send('request-sidebar-data');
	},
	showAllTabsMenu: () => {
		ipcRenderer.send('show-all-tabs-menu');
	},
	notifyReady: () => {
		ipcRenderer.send('titlebar-ready');
	},

	subscribeOnTabsState: (callback) => {
		ipcRenderer.on('tabs-state', (event, state) => {
			callback(state);
		});
	},
	subscribeOnTabInfo: (callback) => {
		ipcRenderer.on('tab-info', (event, tabId, info) => {
			callback(tabId, info);
		});
	},
	subscribeOnSidebarChange: (callback) => {
		ipcRenderer.on('sidebar-changed', (event, collapsed, width) => {
			callback(collapsed, width);
		});
	},
	subscribeOnSidebarFoldingStop: (callback) => {
		ipcRenderer.on('sidebar-folding-stop', () => {
			callback();
		});
	},
	subscribeOnGlobalOptions: (callback) => {
		ipcRenderer.on('global-options', (event, info) => {
			callback(info);
		});
	},
	subscribeOnZoomFactor: (callback) => {
		ipcRenderer.on('zoom-factor', (event, zoomFactor) => {
			callback(zoomFactor);
		});
	},
	subscribeOnAction: (callback) => {
		ipcRenderer.on('action', (event, action, data) => {
			callback(action, data);
		});
	},
};

contextBridge.exposeInMainWorld('notionElectronAPI', api);
