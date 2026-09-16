import { contextBridge, ipcRenderer } from 'electron';
import type { NotionWebAuthnPinAPI } from '../shared/ipc';

const api: NotionWebAuthnPinAPI = {
	submitPin: (pin) => {
		ipcRenderer.send('webauthn-pin-submit', pin);
	},
	cancel: () => {
		ipcRenderer.send('webauthn-pin-cancel');
	},
	subscribeOnPinRequest: (callback) => {
		ipcRenderer.on('webauthn-pin-request', (event, request) => {
			callback(request);
		});
	},
};

contextBridge.exposeInMainWorld('notionElectronWebAuthnAPI', api);
