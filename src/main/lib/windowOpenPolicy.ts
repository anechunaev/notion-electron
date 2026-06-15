import { shell, type WindowOpenHandlerResponse } from 'electron';
import { URL } from 'node:url';

const AUTH_HOSTS = ['notion.so', 'notion.com', 'google.com', 'live.com', 'microsoft.com', 'apple.com'];

export function resolveWindowOpen(
	url: string,
	disposition: string,
	requestNotionTab: (url: string) => void,
): WindowOpenHandlerResponse {
	const u = new URL(url);

	const isAuthHost = AUTH_HOSTS.some((host) => u.hostname.includes(host));

	if (isAuthHost && disposition === 'new-window') {
		return {
			action: 'allow',
			overrideBrowserWindowOptions: {
				width: 520,
				height: 760,
				show: true,
				autoHideMenuBar: true,
				webPreferences: {
					sandbox: true,
					contextIsolation: true,
					nodeIntegration: false,
				},
			},
		};
	}

	if (u.hostname.includes('notion.com') || u.hostname.includes('notion.so')) {
		if (disposition === 'new-window' || disposition === 'foreground-tab' || disposition === 'background-tab') {
			requestNotionTab(u.toString());
			return { action: 'deny' };
		}
		return { action: 'allow' };
	}

	shell.openExternal(url);
	return { action: 'deny' };
}
