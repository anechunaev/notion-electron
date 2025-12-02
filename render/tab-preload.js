const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('notionElectronAPI', {
	changeTab: (tabId) => {
		ipcRenderer.send('change-tab', tabId);
	},
	addTab: (options) => new Promise((resolve, reject) => {
		ipcRenderer.send('add-tab', options);
		setTimeout(resolve, 0);
	}),
	closeTab: (tabId) => new Promise((resolve, reject) => {
		ipcRenderer.send('close-tab', tabId);
		setTimeout(resolve, 0);
	}),
	setUrl: (tabId, url) => {
		ipcRenderer.send('set-url', tabId, url);
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
	togglePinTab: (tabId, isPinned) => {
		ipcRenderer.send('tab-pin-toggle', tabId, isPinned);
	},
	notifyReady: () => {
		ipcRenderer.send('titlebar-ready');
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
	subscribeOnTabRequest: (callback) => {
		ipcRenderer.on('tab-request', (event, options) => {
			callback(options);
		});
	},
	subscribeOnContextMenu: (callback) => {
		ipcRenderer.on('context-menu-command', (event, command) => {
			callback(command);
		});
	},
	subscribeOnGlobalOptions: (callback) => {
		ipcRenderer.on('global-options', (event, info) => {
			callback(info);
		});
	},
	subscribeOZoomFactor: (callback) => {
		ipcRenderer.on('zoom-factor', (event, zoomFactor) => {
			callback(zoomFactor);
		});
	},
});
