import type Store from 'electron-store';
import type { Rectangle } from 'electron';

// Which "app" a tab belongs to.
export type AppName = 'notes' | 'calendar' | 'mail';

export type TabAppMap = Record<AppName, string[]>;

// Persisted state managed via electron-store. Option values (keyed by their
// dynamic option id) are not listed here — electron-store's string-key overload
// covers them and OptionsService types them via OptionValues.
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

// Typed values for every option declared in options.json, so getOption returns
// a precise type at each call site.
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

// Shape of options.json.
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

// The app sets a custom `isQuiting` flag to distinguish a real quit from a
// hide-to-tray close.
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace -- required to augment the Electron namespace
	namespace Electron {
		interface App {
			isQuiting?: boolean;
		}
	}
}
