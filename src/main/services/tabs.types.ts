import type { WebContentsView } from 'electron';
import type { AppName } from '../types';

export interface TabRequestOptions {
	tabId?: string | undefined;
	url?: string | undefined;
	isPinned?: boolean | undefined;
	app?: AppName | undefined;
	skipChange?: boolean | undefined;
}

// Read-only view of the tab state, for collaborators that only need to inspect tabs.
export interface TabReader {
	getTabView(tabId: string): WebContentsView | undefined;
	getTitleBarView(): WebContentsView;
	getTabIds(): string[];
	getTabIcon(tabId: string): string | undefined;
	getTabTitle(tabId: string): string | undefined;
	getCurrentTabId(): string | null;
	isPinned(tabId: string): boolean;
}

// Commands that mutate tabs or drive tab actions.
export interface TabCommands {
	togglePinTab(tabId: string, isPinned: boolean): void;
	duplicateTab(tabId: string): void;
	requestTab(options: TabRequestOptions): void;
	closeTab(tabId: string): void;
	closeOthers(tabId: string): void;
	closeAll(): void;
	runAction(actionName: string): void;
}
