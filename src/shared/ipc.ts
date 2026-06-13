// Payload types shared across the preload bridge and the renderer pages.

export interface TabInfo {
	title: string | null;
	icon: string | null;
	documentUrl?: string;
	canGoBack: boolean;
	canGoForward: boolean;
}

export interface TabRequest {
	url?: string | undefined;
	tabId?: string | undefined;
	isPinned?: boolean | undefined;
	app?: string | undefined;
	skipChange?: boolean | undefined;
}

export interface ContextMenuCommand {
	id: string;
	tabId?: string;
	tabIds?: string[];
}

export interface GlobalOptions {
	initialTabId: string | null;
	sidebarContinueToTitlebar: boolean;
}

export interface AppMetadata {
	version: string;
	author: string;
	license: string;
	description: string;
}

export interface RendererOptionDefinition {
	name: string;
	group?: string;
	value: {
		type: string;
		default: unknown;
		options?: Record<string, string>;
		data?: unknown;
	};
}

export interface OptionsPayload {
	groups: Record<string, string>;
	options: Record<string, RendererOptionDefinition>;
}

export interface UpdateStatus {
	lastChecked: string;
	lastCheckedFormatted: string;
	availableVersion: string;
	localVersion: string;
	stage: string;
	percentage: number;
	downloaded: string;
	total: string;
	speed: string;
	error: Error | null;
}

// API exposed by tab-preload onto the titlebar window.
export interface NotionTitlebarAPI {
	changeTab(tabId: string): void;
	addTab(options: TabRequest): Promise<void>;
	closeTab(tabId: string): Promise<void>;
	setUrl(tabId: string, url: string): void;
	historyBack(): void;
	historyForward(): void;
	foldSidebar(collapsed: boolean): void;
	toggleSidebar(): void;
	showContextMenu(tabId: string): void;
	requestGlobalOptions(): void;
	requestSidebarData(): void;
	showAllTabsMenu(): void;
	togglePinTab(tabId: string, isPinned: boolean): void;
	notifyReady(): void;
	subscribeOnTabInfo(callback: (tabId: string, info: TabInfo) => void): void;
	subscribeOnSidebarChange(callback: (collapsed: boolean, width: string) => void): void;
	subscribeOnSidebarFoldingStop(callback: () => void): void;
	subscribeOnTabRequest(callback: (options: TabRequest) => void): void;
	subscribeOnContextMenu(callback: (command: ContextMenuCommand) => void): void;
	subscribeOnGlobalOptions(callback: (info: GlobalOptions) => void): void;
	subscribeOnZoomFactor(callback: (zoomFactor: number) => void): void;
	subscribeOnAction(callback: (action: string, data: unknown) => void): void;
}

// API exposed by options-preload onto the options window.
export interface NotionOptionsAPI {
	restartApp(): void;
	closeWindow(): void;
	getAppMetadata(): void;
	getOptions(): void;
	setOption(optionId: string, value: unknown): void;
	requestUpdateStatus(): void;
	checkUpdateForced(): void;
	downloadUpdate(): void;
	installUpdate(): void;
	requestChangelog(): void;
	subscribeOnTabChange(callback: (tabName: string) => void): void;
	subscribeOnAppMetadata(callback: (data: AppMetadata) => void): void;
	subscribeOnOptions(callback: (data: OptionsPayload) => void): void;
	subscribeOnUpdateStatusChange(callback: (data: UpdateStatus) => void): void;
	subscribeOnUpdateChangelog(callback: (html: string) => void): void;
}
