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

export interface TabState {
	id: string;
	app: string;
	url?: string | undefined;
	title: string | null;
	icon: string | null;
	pinned: boolean;
}

export interface TabsStatePayload {
	tabs: TabState[];
	currentTabId: string | null;
	canGoBack: boolean;
	canGoForward: boolean;
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

export interface ChangelogItem {
	version: string;
	dateFormatted: string;
	notes: string;
	url: string;
}

export interface UpdateStatus {
	lastChecked: string;
	lastCheckedFormatted: string;
	availableVersion: string;
	localVersion: string;
	canAutoUpdate: boolean;
	releaseUrl: string;
	stage: string;
	percentage: number;
	downloaded: string;
	total: string;
	speed: string;
	error: Error | null;
}

export interface NotionTitlebarAPI {
	selectTab(tabId: string): void;
	addTab(options: TabRequest): void;
	closeTab(tabId: string): void;
	closeCurrentTab(): void;
	closeOtherTabs(tabId: string): void;
	closeAllTabs(): void;
	nextTab(): void;
	previousTab(): void;
	reorderTabs(pinnedIds: string[], normalIds: string[]): void;
	historyBack(): void;
	historyForward(): void;
	foldSidebar(collapsed: boolean): void;
	toggleSidebar(): void;
	showContextMenu(tabId: string): void;
	requestGlobalOptions(): void;
	requestSidebarData(): void;
	showAllTabsMenu(): void;
	notifyReady(): void;
	subscribeOnTabsState(callback: (state: TabsStatePayload) => void): void;
	subscribeOnTabInfo(callback: (tabId: string, info: TabInfo) => void): void;
	subscribeOnSidebarChange(callback: (collapsed: boolean, width: string) => void): void;
	subscribeOnSidebarFoldingStop(callback: () => void): void;
	subscribeOnGlobalOptions(callback: (info: GlobalOptions) => void): void;
	subscribeOnZoomFactor(callback: (zoomFactor: number) => void): void;
	subscribeOnAction(callback: (action: string, data: unknown) => void): void;
}

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
	subscribeOnUpdateChangelog(callback: (items: ChangelogItem[]) => void): void;
}
