// eslint-disable-next-line import/no-extraneous-dependencies
import { app, screen, nativeTheme, BaseWindow, BrowserWindow, Menu } from 'electron';
import Store from 'electron-store';
import EventEmitter from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import pkg from './package.json' with { type: 'json' };
import TabService from './services/tabs.mjs';
import WindowPositionService from './services/windowPosition.mjs';
import TrayService from './services/tray.mjs';
import ContextMenuService from './services/contextMenu.mjs';
import OptionsService from './services/options.mjs';
import UpdateService from './services/update.mjs';
import ChangelogService from './services/changelog.mjs';
import NotificationService from './services/notifications.mjs';
import { createMonitorBus } from './lib/dbus.mjs';

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(__filename);
const TITLEBAR_HEIGHT = 40;
const DARK_THEME_BACKGROUND = '#202020';
const LIGHT_THEME_BACKGROUND = '#f8f8f7';

let mainWindow = null;
const store = new Store();
const mainBus = new EventEmitter();
const optionsConfig = JSON.parse(readFileSync(path.join(__dirname, './options.json'), 'utf8'));
const optionsService = new OptionsService(store, optionsConfig, mainBus);

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

	let themeProxyPromise = Promise.resolve();
	let dBusMonitorDisconnect = () => {};
	let onDBusSignal = () => {};

	createMonitorBus({
		requestedName: pkg.dbus.name,
		onError: (error) => console.error('D-Bus Monitor Error:', error),
	})
		.then(({ dBus, disconnect, addSignalListener }) => {
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
				args: ['org.freedesktop.appearance', 'color-scheme'],
			});
			dBusMonitorDisconnect = disconnect;
			onDBusSignal = addSignalListener;
		})
		.catch((error) => {
			console.error('Failed to connect to D-Bus:', error);
		})
		.finally(() => {
			Promise.all([themeProxyPromise, app.whenReady()]).then(([dBusColorScheme]) => {
				Menu.setApplicationMenu(null);
				nativeTheme.themeSource = optionsService.getOption('general-theme');
				let bgColor = LIGHT_THEME_BACKGROUND;
				if (optionsService.getOption('general-theme') === 'system') {
					bgColor =
						(dBusColorScheme?.args[0][1][1] ?? nativeTheme.shouldUseDarkColors)
							? DARK_THEME_BACKGROUND
							: LIGHT_THEME_BACKGROUND;
				} else {
					bgColor =
						optionsService.getOption('general-theme') === 'dark'
							? DARK_THEME_BACKGROUND
							: LIGHT_THEME_BACKGROUND;
				}

				mainWindow = new BaseWindow({
					title: 'Notion Electron',
					minWidth: 600,
					minHeight: 400,
					width: screen.getPrimaryDisplay().workAreaSize.width * 0.8,
					height: screen.getPrimaryDisplay().workAreaSize.height * 0.8,
					titleBarStyle: 'hidden',
					icon: path.join(__dirname, './assets/icons/desktop.png'),
					show: optionsService.getOption('general-show-window-on-start'),
					webPreferences: {
						spellcheck: optionsService.getOption('general-enable-spellcheck'),
					},
					titleBarOverlay: {
						color: bgColor,
						height: TITLEBAR_HEIGHT,
					},
					contextIsolation: false,
					backgroundColor: bgColor,
				});

				const tabService = new TabService(mainWindow, optionsService, store, mainBus);
				const windowPositionService = new WindowPositionService(mainWindow, store);

				setTimeout(function initApp() {
					const optionsWindow = new BrowserWindow({
						minWidth: 600,
						minHeight: 400,
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

					optionsWindow.on('close', function onOptionsClose(event) {
						if (!app.isQuiting) {
							event.preventDefault();
							optionsWindow.hide();
						}
					});

					const notificationService = new NotificationService();
					const changelogService = new ChangelogService(pkg.repository.owner, pkg.repository.name);
					const updateService = new UpdateService(
						optionsWindow,
						notificationService,
						changelogService,
						store,
						optionsService,
					);
					const trayService = new TrayService(mainWindow, optionsWindow);
					const contextMenuService = new ContextMenuService(mainWindow, tabService, mainBus);

					optionsService.setOptionsWindow(optionsWindow);

					updateService.on('update-available', trayService.onUpdateAvailable);
					updateService.on('update-not-available', trayService.onUpdateNotAvailable);

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

					mainWindow.on('minimize', function mainWindowMinimize(event) {
						if (optionsService.getOption('hide-to-tray')) {
							event.preventDefault();
							mainWindow.hide();
						}
					});

					mainWindow.on('close', function mainWindowClose(event) {
						if (!app.isQuiting && optionsService.getOption('hide-window-on-close')) {
							event.preventDefault();
							mainWindow.hide();
							return false;
						}
						try {
							windowPositionService.savePosition();
							dBusMonitorDisconnect();
						} catch (e) {
							console.error(e);
						}
						app.quit();
						process.exit(0);
					});
				}, 1); // Guaranteed to run on next tick despite engine optimizations
				windowPositionService.restorePosition();
			});
		});

	app.on('window-all-closed', (event) => {
		if (optionsService.getOption('hide-window-on-close')) {
			event.preventDefault();
		} else {
			app.quit();
			process.exit(0);
		}
	});
}
