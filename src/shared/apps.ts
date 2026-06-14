// Single source of truth for the wrapped Notion apps. Imported by both the main process
// (tab classification, pinned-app setup) and the titlebar renderer so the two never drift.

export type AppName = 'notes' | 'calendar' | 'mail';

export interface AppDefinition {
	id: AppName;
	homeUrl: string;
	isPinnedByDefault: boolean;
	matches(url: URL): boolean;
}

// Order matters: the first definition whose `matches` returns true wins, so `notes` (the
// catch-all) must come last.
export const APP_DEFINITIONS: readonly AppDefinition[] = [
	{
		id: 'calendar',
		homeUrl: 'https://calendar.notion.so',
		isPinnedByDefault: true,
		matches: (url) => url.pathname.startsWith('/calendarAuth') || url.hostname === 'calendar.notion.so',
	},
	{
		id: 'mail',
		homeUrl: 'https://mail.notion.com',
		isPinnedByDefault: true,
		matches: (url) => url.hostname === 'mail.notion.so',
	},
	{
		id: 'notes',
		homeUrl: 'https://www.notion.com/login',
		isPinnedByDefault: false,
		matches: () => true,
	},
];

export const APP_NAMES: readonly AppName[] = APP_DEFINITIONS.map((app) => app.id);

export function getAppFromUrl(url: string): AppName {
	const parsed = new URL(url);
	return (APP_DEFINITIONS.find((app) => app.matches(parsed)) ?? APP_DEFINITIONS[APP_DEFINITIONS.length - 1]!).id;
}

export function getAppHomeUrl(id: AppName): string {
	return (APP_DEFINITIONS.find((app) => app.id === id) ?? APP_DEFINITIONS[APP_DEFINITIONS.length - 1]!).homeUrl;
}

export function createAppMap<T>(makeValue: () => T): Record<AppName, T> {
	return Object.fromEntries(APP_NAMES.map((id): [AppName, T] => [id, makeValue()])) as Record<AppName, T>;
}
