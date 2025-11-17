import { app, screen, nativeTheme, BaseWindow, BrowserWindow, Menu } from 'electron';
import Store from 'electron-store';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pkg from './package.json' with { type: "json" };
import TabService from './services/tabs.mjs';
import WindowPositionService from './services/windowPosition.mjs';
import TrayService from './services/tray.mjs';
import ContextMenuService from './services/contextMenu.mjs';
import OptionsService from './services/options.mjs';
import UpdateService from './services/update.mjs';
import ChangelogService from './services/changelog.mjs';
import NotificationService from './services/notifications.mjs';
import { createMonitorBus } from './lib/dbus.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TITLEBAR_HEIGHT = 40;
const DARK_THEME_BACKGROUND = '#202020';
const LIGHT_THEME_BACKGROUND = '#f8f8f7';

let mainWindow = null;
const store = new Store();

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
	let dBusMonitorDisconnect = () => {};
	let onDBusSignal = () => {};

	createMonitorBus({
		requestedName: pkg.dbus.name,
		onError: (error) => {
			console.error('D-Bus Monitor Error:', error);
		},
	}).then(({ dBus, disconnect, addSignalListener }) => {
		themeProxyPromise = dBus.callMethod({
			messageType: 1,
			objectPath: `/org/freedesktop/portal/desktop`,
			interfaceName: `org.freedesktop.portal.Settings`,
			memberName: `Read`,
			serial: dBus.nextSerial,
			destination: `org.freedesktop.portal.Desktop`,
			types: [
				{
					typeCode: 's',
					bytePadding: 4,
					predicate: (value) => typeof value === 'string',
				},
				{
					typeCode: 's',
					bytePadding: 4,
					predicate: (value) => typeof value === 'string',
				},
			],
			args: [
				'org.freedesktop.appearance',
				'color-scheme',
			],
		});
		dBusMonitorDisconnect = disconnect;
		onDBusSignal = addSignalListener;
	}).catch((error) => {
		console.error('Failed to connect to D-Bus:', error);
	}).finally(() => {
		Promise.all([
			themeProxyPromise,
			app.whenReady(),
		]).then(([dBusColorScheme]) => {
			Menu.setApplicationMenu(null);
			nativeTheme.themeSource = store.get('general-theme', 'system');
			const bgColor = store.get('general-theme', 'system') === 'system'
				? (dBusColorScheme?.args[0][1][1] ?? nativeTheme.shouldUseDarkColors ? DARK_THEME_BACKGROUND : LIGHT_THEME_BACKGROUND)
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
				try {
					windowPositionService.savePosition();
					dBusMonitorDisconnect();
				} catch (e) {}
				return false;
			});

			optionsWindow.on('close', function (event) {
				if (!app.isQuiting) {
					event.preventDefault();
					optionsWindow.hide();
				}
			});

			onDBusSignal('Options', () => {
				optionsWindow.webContents.send('show-tab', 'options');
				optionsWindow.show();
			});

			onDBusSignal('Updates', () => {
				optionsWindow.webContents.send('show-tab', 'updates');
				optionsWindow.show();
			});

			onDBusSignal('About', () => {
				optionsWindow.webContents.send('show-tab', 'about');
				optionsWindow.show();
			});

			windowPositionService.restorePosition();
		});
	});

	app.on('window-all-closed', (event) => {
		if (process.platform !== 'darwin') {
			event.preventDefault();
		}
	});
}