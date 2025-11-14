import { app, screen, nativeTheme, BaseWindow, BrowserWindow, Menu } from 'electron';
import Store from 'electron-store';
import DBusNext from 'dbus-next';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pkg from './package.json' with { type: "json" };
import { getDBusInterface } from './lib/dbus.mjs';
import TabService from './services/tabs.mjs';
import WindowPositionService from './services/windowPosition.mjs';
import TrayService from './services/tray.mjs';
import ContextMenuService from './services/contextMenu.mjs';
import OptionsService from './services/options.mjs';
import UpdateService from './services/update.mjs';
import ChangelogService from './services/changelog.mjs';
import NotificationService from './services/notifications.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TITLEBAR_HEIGHT = 40;
const DARK_THEME_BACKGROUND = '#202020';
const LIGHT_THEME_BACKGROUND = '#f8f8f7';

let mainWindow = null;
const store = new Store();
const dbusSession = DBusNext.sessionBus();
dbusSession.requestName(pkg.dbus.name).catch(() => {});

if (!app.requestSingleInstanceLock()) {
	app.quit();
	process.exit(0);
} else {
	app.on('second-instance', () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.show();
			mainWindow.focus();
		}
	});

	const showOnStartup = process.argv.includes("--hide-on-startup") ? false : store.get('general-show-window-on-start', true);
	const enableSpellcheck = process.argv.includes("--disable-spellcheck") ? false : store.get('general-enable-spellcheck', false);

	let themeProxyPromise = Promise.resolve();
	if (dbusSession) {
		themeProxyPromise = dbusSession.getProxyObject(
			'org.freedesktop.portal.Desktop',
			'/org/freedesktop/portal/desktop'
		).then((obj) => {
			const settings = obj.getInterface('org.freedesktop.portal.Settings');
			return settings.Read('org.freedesktop.appearance', 'color-scheme');
		}).catch(() => {
			return null;
		});
	}

	Promise.all([
		themeProxyPromise,
		app.whenReady(),
	]).then(([ dbusColorScheme ]) => {
		Menu.setApplicationMenu(null);
		nativeTheme.themeSource = store.get('general-theme', 'system');
		const bgColor = store.get('general-theme', 'system') === 'system'
			? (dbusColorScheme?.value?.value ?? nativeTheme.shouldUseDarkColors ? DARK_THEME_BACKGROUND : LIGHT_THEME_BACKGROUND)
			: (store.get('general-theme', 'system') === 'dark' ? DARK_THEME_BACKGROUND : LIGHT_THEME_BACKGROUND);

		mainWindow = new BaseWindow({
			title: 'Notion Electron',
			minWidth: 800,
			minHeight: 600,
			width: screen.getPrimaryDisplay().workAreaSize.width * 0.8,
			height: screen.getPrimaryDisplay().workAreaSize.height * 0.8,
			titleBarStyle: 'hidden',
			icon: path.join(__dirname, './assets/icons/desktop.png'),
			show: showOnStartup,
			webPreferences: {
				spellcheck: enableSpellcheck,
			},
			titleBarOverlay: {
				color: bgColor,
				height: TITLEBAR_HEIGHT,
			},
			contextIsolation: false,
			backgroundColor: bgColor,
		});
		const optionsWindow = new BrowserWindow({
			minWidth: 800,
			minHeight: 600,
			width: screen.getPrimaryDisplay().workAreaSize.width * 0.5,
			height: screen.getPrimaryDisplay().workAreaSize.height * 0.5,
			show: false,
			parent: mainWindow,
			webPreferences: {
				spellcheck: false,
				preload: path.join(__dirname, './render/options-preload.js'),
			},
			title: 'Notion Electron Options',
			icon: path.join(__dirname, './assets/icons/desktop.png'),
			backgroundColor: bgColor,
		});
		optionsWindow.loadFile(path.join(__dirname, './assets/pages/options.html'));

		try {
			const iface = new (getDBusInterface(optionsWindow))(pkg.dbus.name);
			dbusSession.export(
				pkg.dbus.path,
				iface,
			);
			dbusSession.on('message', (msg) => {
				if (msg.path === pkg.dbus.path && msg.interface === pkg.dbus.interface) {
					if (typeof iface[msg.member] === 'function') {
						iface[msg.member]();
					}
				}
			});
		} catch(e) {
			console.error('Failed to export D-Bus interface:', e);
		}

		const notificationService = new NotificationService();
		const optionsService = new OptionsService(mainWindow, optionsWindow, store);
		const tabService = new TabService(mainWindow, optionsService, store);
		const windowPositionService = new WindowPositionService(mainWindow, store);
		const trayService = new TrayService(mainWindow, optionsWindow);
		const contextMenuService = new ContextMenuService(mainWindow, tabService);
		const changelogService = new ChangelogService(pkg.repository.owner, pkg.repository.name);
		const updateService = new UpdateService(optionsWindow, notificationService, changelogService, store);

		updateService.on('update-available', trayService.onUpdateAvailable);
		updateService.on('update-not-available', trayService.onUpdateNotAvailable);

		mainWindow.on('minimize', function (event) {
			event.preventDefault();
			mainWindow.hide();
		});
	
		mainWindow.on('close', function (event) {
			if (!app.isQuiting) {
				event.preventDefault();
				mainWindow.hide();
			}
			windowPositionService.savePosition();
			return false;
		});

		optionsWindow.on('close', function (event) {
			if (!app.isQuiting) {
				event.preventDefault();
				optionsWindow.hide();
			}
		});

		windowPositionService.restorePosition();
	});

	app.on('window-all-closed', (event) => {
		if (process.platform !== 'darwin') {
			event.preventDefault();
		}
	});
}