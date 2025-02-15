import { app, screen, nativeTheme, BaseWindow, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import TabService from './services/tabs.mjs';
import WindowPositionService from './services/windowPosition.mjs';
import TrayService from './services/tray.mjs';
import ContextMenuService from './services/contextMenu.mjs';
import OptionsService from './services/options.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TITLEBAR_HEIGHT = 44;
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
	nativeTheme.themeSource = store.get('general-theme', 'system');
	const bgColor = store.get('general-theme', 'system') === 'system'
		? (nativeTheme.shouldUseDarkColors ? DARK_THEME_BACKGROUND : LIGHT_THEME_BACKGROUND)
		: (store.get('general-theme', 'system') === 'dark' ? DARK_THEME_BACKGROUND : LIGHT_THEME_BACKGROUND);

	app.whenReady().then(() => {
		mainWindow = new BaseWindow({
			title: 'Notion Electorn',
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

		const optionsService = new OptionsService(mainWindow, optionsWindow, store);
		const tabService = new TabService(mainWindow, optionsService);
		const windowPositionService = new WindowPositionService(mainWindow, store);
		const trayService = new TrayService(mainWindow, optionsWindow);
		const contextMenuService = new ContextMenuService(mainWindow, tabService);

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