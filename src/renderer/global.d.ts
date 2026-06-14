import type { NotionTitlebarAPI, NotionOptionsAPI } from '../shared/ipc';

declare global {
	interface Window {
		notionElectronAPI: NotionTitlebarAPI & NotionOptionsAPI;
	}
}

export {};
