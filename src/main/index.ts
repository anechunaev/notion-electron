import { app, screen, BaseWindow, BrowserWindow, Menu } from 'electron';
import Store from 'electron-store';
import EventEmitter from 'node:events';
import type { Message } from 'd-bus-message-protocol';
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
import ThemeService from './services/theme';
import MainWindowService from './services/mainWindow';
import { createMonitorBus } from './lib/dbus';
import { resolveAsset, resolvePreload, loadRendererPage } from './lib/resources';
import type { OptionsConfig, StoreSchema } from './types';

const TITLEBAR_HEIGHT = 40;

let mainWindow: BaseWindow | null = null;
const store = new Store<StoreSchema>();
const mainBus = new EventEmitter();
const optionsService = new OptionsService(store, optionsConfig as OptionsConfig, mainBus);
const themeService = new ThemeService(optionsService);

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
			themeProxyPromise = themeService.queryColorScheme(dBus);
			dBusMonitorDisconnect = disconnect;
			onDBusSignal = addSignalListener;
		})
		.catch((error) => {
			console.error('Failed to connect to D-Bus:', error);
		})
		.finally(() => {
			Promise.all([themeProxyPromise, app.whenReady()]).then(([dBusColorScheme]) => {
				Menu.setApplicationMenu(null);
				themeService.applyThemeSource();
				const bgColor = themeService.resolveBackgroundColor(dBusColorScheme);

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
				const mainWindowService = new MainWindowService(mainWindow, optionsService, () =>
					dBusMonitorDisconnect(),
				);

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
					mainWindowService.manageOptionsWindow(optionsWindow);

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
				}, 1); // Guaranteed to run on next tick despite engine optimizations
				windowPositionService.restorePosition(mainWindow);
			});
		});
}
