import { app, screen, nativeTheme, BaseWindow, BrowserWindow, Menu } from 'electron';
import Store from 'electron-store';
import EventEmitter from 'node:events';
import { MessageType, type Message } from 'd-bus-message-protocol';
import { stringType } from 'd-bus-type-system';
import pkg from '../../package.json';
import optionsConfig from '../../options.json';
import TabService from './services/tabs';
import WindowPositionService from './services/windowPosition';
import TrayService from './services/tray';
import ContextMenuService from './services/contextMenu';
import OptionsService from './services/options';
import UpdateService from './services/update';
import ChangelogService from './services/changelog';
import NotificationService from './services/notifications';
import { createMonitorBus } from './lib/dbus';
import { resolveAsset, resolvePreload, loadRendererPage } from './lib/resources';
import type { OptionsConfig, StoreSchema } from './types';

// Shape of the freedesktop appearance portal `Read` reply we navigate into.
type DBusReadReply = { args?: ReadonlyArray<ReadonlyArray<ReadonlyArray<unknown>>> };

const TITLEBAR_HEIGHT = 40;
const DARK_THEME_BACKGROUND = '#202020';
const LIGHT_THEME_BACKGROUND = '#f8f8f7';

let mainWindow: BaseWindow | null = null;
const store = new Store<StoreSchema>();
const mainBus = new EventEmitter();
const optionsService = new OptionsService(store, optionsConfig as OptionsConfig, mainBus);

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

	let themeProxyPromise: Promise<unknown> = Promise.resolve();
	let dBusMonitorDisconnect: () => void = () => {};
	let onDBusSignal: (signalName: string, callback: (message: Message) => void) => void = () => {};

	createMonitorBus({
		requestedName: pkg.dbus.name,
		onError: (error) => console.error('D-Bus Monitor Error:', error),
	})
		.then(({ dBus, disconnect, addSignalListener }) => {
			themeProxyPromise = dBus.callMethod({
				messageType: MessageType.MethodCall,
				objectPath: `/org/freedesktop/portal/desktop`,
				interfaceName: `org.freedesktop.portal.Settings`,
				memberName: `Read`,
				serial: dBus.nextSerial,
				destination: `org.freedesktop.portal.Desktop`,
				types: [stringType, stringType],
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
					const colorScheme = (dBusColorScheme as DBusReadReply | undefined)?.args?.[0]?.[1]?.[1];
					bgColor =
						(colorScheme ?? nativeTheme.shouldUseDarkColors)
							? DARK_THEME_BACKGROUND
							: LIGHT_THEME_BACKGROUND;
				} else {
					bgColor =
						optionsService.getOption('general-theme') === 'dark'
							? DARK_THEME_BACKGROUND
							: LIGHT_THEME_BACKGROUND;
				}

				const windowPositionService = new WindowPositionService(store);
				const savedPosition = windowPositionService.getPosition();

				mainWindow = new BaseWindow({
					title: 'Notion Electron',
					minWidth: 600,
					minHeight: 400,
					width: savedPosition.bounds.width,
					height: savedPosition.bounds.height,
					titleBarStyle: 'hidden',
					icon: resolveAsset('icons/desktop.png'),
					show: optionsService.getOption('general-show-window-on-start'),
					titleBarOverlay: {
						color: bgColor,
						height: TITLEBAR_HEIGHT,
					},
					backgroundColor: bgColor,
				});

				windowPositionService.subscribeToPositionChange(mainWindow);

				const tabService = new TabService(mainWindow, optionsService, store, mainBus);

				setTimeout(function initApp() {
					if (!mainWindow) return;
					const optionsWindow = new BrowserWindow({
						minWidth: 600,
						minHeight: 400,
						width: screen.getPrimaryDisplay().workAreaSize.width * 0.5,
						height: screen.getPrimaryDisplay().workAreaSize.height * 0.5,
						show: false,
						parent: mainWindow,
						webPreferences: {
							spellcheck: false,
							preload: resolvePreload('options.cjs'),
						},
						title: 'Notion Electron Options',
						icon: resolveAsset('icons/desktop.png'),
						backgroundColor: bgColor,
					});
					loadRendererPage(optionsWindow, 'options');

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
					// TODO: convert to function
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

					mainWindow.on('minimize', function mainWindowMinimize(event?: Electron.Event) {
						if (optionsService.getOption('hide-to-tray')) {
							event?.preventDefault();
							mainWindow?.hide();
						}
					});

					mainWindow.on('close', function mainWindowClose(event: Electron.Event) {
						if (!app.isQuiting && optionsService.getOption('hide-window-on-close')) {
							event.preventDefault();
							mainWindow?.hide();
							return;
						}
						try {
							dBusMonitorDisconnect();
						} catch (e) {
							console.warn(e);
						} finally {
							app.quit();
							process.exit(0);
						}
					});
				}, 1); // Guaranteed to run on next tick despite engine optimizations
				windowPositionService.restorePosition(mainWindow);
			});
		});

	app.on('window-all-closed', (event?: Electron.Event) => {
		if (optionsService.getOption('hide-window-on-close')) {
			event?.preventDefault();
		} else {
			app.quit();
			process.exit(0);
		}
	});
}
