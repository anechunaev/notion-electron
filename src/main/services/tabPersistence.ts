import { createAppMap, isAppName } from '../../shared/apps';
import type { AppName, AppStore, TabAppMap } from '../types';
import type OptionsService from './options';

export interface PersistedTabState {
	tabs: Record<string, string>;
	titles: Record<string, string>;
	currentTabId: string | null;
	pinned: Record<string, boolean>;
	apps: TabAppMap;
}

// Encapsulates the `electron-store` schema for tabs so TabsService doesn't deal with
// store keys directly. Persistence is gated on the `tabs-reopen-on-start` option.
class TabPersistence {
	private store: AppStore;
	private options: OptionsService;

	constructor(store: AppStore, options: OptionsService) {
		this.store = store;
		this.options = options;
	}

	public getCurrentTabId(): string | null {
		return this.store.get('tab-current', null);
	}

	public getSavedTabs(): Record<string, string> {
		return this.store.get('tabs', {});
	}

	public getSavedTitles(): Record<string, string> {
		return this.store.get('tab-titles', {});
	}

	public isPinned(tabId: string): boolean {
		return this.store.get('tabs-pinned', {})[tabId] ?? false;
	}

	// Returns null for a tab persisted under an app this version no longer supports, so the
	// caller drops it instead of restoring a tab that can no longer be pinned or closed.
	public getAppForTab(tabId: string): AppName | null {
		const apps = this.store.get(
			'tab-apps',
			createAppMap<string[]>(() => []),
		);
		const entry = Object.entries(apps).find(([, tabIds]) => tabIds.includes(tabId));
		if (!entry) return 'notes';
		return isAppName(entry[0]) ? entry[0] : null;
	}

	public save(state: PersistedTabState): void {
		if (!this.options.getOption('tabs-reopen-on-start')) return;
		this.store.set('tabs', state.tabs);
		this.store.set('tab-titles', state.titles);
		this.store.set('tab-current', state.currentTabId);
		this.store.set('tabs-pinned', state.pinned);
		this.store.set('tab-apps', state.apps);
	}
}

export default TabPersistence;
