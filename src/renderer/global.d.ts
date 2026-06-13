import type { NotionTitlebarAPI, NotionOptionsAPI } from '../shared/ipc';

// Both preload bridges expose their API under the same `window.notionElectronAPI`
// name (titlebar page vs options page). Each page only uses its own subset, so
// the intersection lets every renderer entry type-check against the right shape.
declare global {
	interface Window {
		notionElectronAPI: NotionTitlebarAPI & NotionOptionsAPI;
	}
}

export {};
