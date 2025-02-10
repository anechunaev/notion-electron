import { app, BrowserWindow, shell, Tray, Menu, screen, session } from 'electron';
import Store from 'electron-store';
import { URL, fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WIN_WIDTH = 1440 * 0.8;
const WIN_HEIGHT = 900 * 0.8;

let tray = null;
let mainWindow = null;
const store = new Store();

function createWindow() {
	const savedBounds = store.get('bounds');
	const isMaximized = store.get('maximized', false);
	const startLocation = store.get('location', '/');

	const mainWindow = new BrowserWindow({
		title: 'Notion Electorn',
		width: WIN_WIDTH,
		height: WIN_HEIGHT,
		icon: path.join(__dirname, '/assets/icons/desktop.png'),
		show: !process.argv.includes("--hide-on-startup"),
		webPreferences: {
			spellcheck: !process.argv.includes("--disable-spellcheck"),
		}
	});

	if (isMaximized) {
		mainWindow.maximize();
	}

	if (savedBounds !== undefined) {
		const screenArea = screen.getDisplayMatching(savedBounds).workArea;
		if (
			(savedBounds.x > screenArea.x + screenArea.width || savedBounds.x < screenArea.x) ||
			(savedBounds.y < screenArea.y || savedBounds.y > screenArea.y + screenArea.height)
		) {
			mainWindow.setBounds({
				x: (screenArea.width - WIN_WIDTH) / 2,
				y: (screenArea.height - WIN_HEIGHT) / 2,
				width: WIN_WIDTH,
				height: WIN_HEIGHT,
			});
		}
		else {
			mainWindow.setBounds(store.get('bounds'));
		}
	}

	mainWindow.loadURL(`https://www.notion.com${startLocation}`, { userAgent: "Chrome" });

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		const u = new URL(url);

		if (u.hostname === 'www.notion.com' || u.hostname === 'www.notion.so') {
			return {
				action: 'allow',
				closeWithOpener: false,
				overrideBrowserWindowOptions: undefined,
			};
		}

		shell.openExternal(url);
		return { action: 'deny' };
	});

	mainWindow.on('minimize', function (event) {
		event.preventDefault();
		mainWindow.hide();
	});

	mainWindow.on('close', function (event) {
		const url = new URL(mainWindow.webContents.getURL());

		store.set('location', url.pathname);
		store.set('bounds', mainWindow.getBounds());
		store.set('maximized', mainWindow.isMaximized());

		if (!app.isQuiting) {
			event.preventDefault();
			mainWindow.hide();
		}
		return false;
	});

	return mainWindow;
}

function createTray() {
	const tray = new Tray(path.join(__dirname, '/assets/icons/tray.png'));

	const contextMenu = Menu.buildFromTemplate([
		{
			label: 'Show App',
			click: function () {
				mainWindow.show();
			},
		},
		{
			label: 'Quit',
			click: function () {
				app.isQuiting = true;
				app.quit();
			},
		},
	]);

	tray.setToolTip('Notion');
	tray.setContextMenu(contextMenu);

	tray.on('click', () => {
		mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
	});

	return tray;
}

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

	app.whenReady().then(() => {
		session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
			details.requestHeaders["User-Agent"] = "Chrome";
			callback({ cancel: false, requestHeaders: details.requestHeaders });
		});
		session.defaultSession.setUserAgent("Chrome");

		mainWindow = createWindow();
		tray = createTray();
	});

	app.on('window-all-closed', (event) => {
		if (process.platform !== 'darwin') {
			event.preventDefault();
		}
	});
}