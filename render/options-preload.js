const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('notionElectronAPI', {
	restartApp: () => {
		ipcRenderer.send('restart');
	},
	closeWindow: () => {
		ipcRenderer.send('close-window');
	},
	getAppMetadata: (callback) => {
		ipcRenderer.send('get-app-metadata');
	},
	getOptions: () => {
		ipcRenderer.send('get-options');
	},
	setOption: (optionId, value) => {
		ipcRenderer.send('set-option', optionId, value);
	},

	subscribeOnTabChange: (callback) => {
		ipcRenderer.on('show-tab', (event, tabName) => {
			callback(tabName);
		});
	},
	subscribeOnAppMetadata: (callback) => {
		ipcRenderer.on('app-metadata', (event, data) => {
			callback(data);
		});
	},
	subscribeOnOptions: (callback) => {
		ipcRenderer.on('options', (event, data) => {
			callback(data);
		});
	},
});
