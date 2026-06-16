import { NOTION_CALENDAR_HOST, NOTION_MAIL_HOST, NOTION_NOTES_HOST } from './constants';

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
		homeUrl: NOTION_CALENDAR_HOST,
		isPinnedByDefault: true,
		matches: (url) => url.pathname.startsWith('/calendarAuth') || url.hostname === 'calendar.notion.so',
	},
	{
		id: 'mail',
		homeUrl: NOTION_MAIL_HOST,
		isPinnedByDefault: true,
		matches: (url) => url.hostname === 'mail.notion.com',
	},
	{
		id: 'notes',
		homeUrl: NOTION_NOTES_HOST,
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
