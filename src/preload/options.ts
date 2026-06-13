import { contextBridge, ipcRenderer } from 'electron';
import type { NotionOptionsAPI } from '../shared/ipc';

const api: NotionOptionsAPI = {
	restartApp: () => {
		ipcRenderer.send('restart');
	},
	closeWindow: () => {
		ipcRenderer.send('close-window');
	},
	getAppMetadata: () => {
		ipcRenderer.send('get-app-metadata');
	},
	getOptions: () => {
		ipcRenderer.send('get-options');
	},
	setOption: (optionId, value) => {
		ipcRenderer.send('set-option', optionId, value);
	},
	requestUpdateStatus: () => {
		ipcRenderer.send('request-update-status');
	},
	checkUpdateForced: () => {
		ipcRenderer.send('check-update-forced');
	},
	downloadUpdate: () => {
		ipcRenderer.send('download-update');
	},
	installUpdate: () => {
		ipcRenderer.send('install-update');
	},
	requestChangelog: () => {
		ipcRenderer.send('request-changelog');
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
	subscribeOnUpdateStatusChange: (callback) => {
		ipcRenderer.on('update-status', (event, data) => {
			callback(data);
		});
	},
	subscribeOnUpdateChangelog: (callback) => {
		ipcRenderer.on('update-changelog', (event, data) => {
			callback(data);
		});
	},
};

contextBridge.exposeInMainWorld('notionElectronAPI', api);
