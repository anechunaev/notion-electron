import type { NotionTitlebarAPI, NotionOptionsAPI } from '../shared/ipc';

declare global {
	interface Window {
		notionElectronAPI: NotionTitlebarAPI & NotionOptionsAPI;
	}

	// Not part of TS's bundled DOM lib: https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API
	interface WindowControlsOverlay extends EventTarget {
		visible: boolean;
		getTitlebarAreaRect(): DOMRect;
		ongeometrychange: ((this: WindowControlsOverlay, ev: Event) => void) | null;
	}

	interface Navigator {
		windowControlsOverlay?: WindowControlsOverlay;
	}
}

export {};
