import type { NotionTitlebarAPI, NotionOptionsAPI, NotionWebAuthnPinAPI } from '../shared/ipc';

declare global {
	interface Window {
		notionElectronAPI: NotionTitlebarAPI & NotionOptionsAPI;
		notionElectronWebAuthnAPI: NotionWebAuthnPinAPI;
	}
}

export {};
