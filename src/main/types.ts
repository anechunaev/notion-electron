import type Store from 'electron-store';
import type { Rectangle } from 'electron';
import type { AppName } from '../shared/apps';

export type { AppName };

export type TabAppMap = Record<AppName, string[]>;

export interface StoreSchema {
	'tab-current'?: string | null;
	'tabs'?: Record<string, string>;
	'tabs-pinned'?: Record<string, boolean>;
	'tab-apps'?: TabAppMap;
	'bounds'?: Rectangle;
	'maximized'?: boolean;
	'update-available-version'?: string;
	'update-last-checked'?: string;
}

export type AppStore = Store<StoreSchema>;

export interface OptionValues {
	'debug-open-dev-tools': boolean;
	'general-theme': 'system' | 'light' | 'dark';
	'general-enable-spellcheck': boolean;
	'general-show-window-on-start': boolean;
	'disable-update-functionality': boolean;
	'tabs-show-calendar': boolean;
	'tabs-show-mail': boolean;
	'tabs-reopen-on-start': boolean;
	'tabs-continue-sidebar': boolean;
	'update-check-interval': 'never' | 'daily' | 'weekly' | 'monthly';
	'update-auto-download': boolean;
	'update-auto-install': boolean;
	'update-notification': boolean;
	'hide-to-tray': boolean;
	'hide-window-on-close': boolean;
}

export interface OptionDefinition {
	name: string;
	group?: string;
	value: {
		type: string;
		default: unknown;
		options?: Record<string, string>;
	};
}

export interface OptionsConfig {
	options: Record<string, OptionDefinition>;
	groups: Record<string, string>;
}

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Electron {
		interface App {
			isQuiting?: boolean;
		}
	}
}
