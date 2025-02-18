import { app, Tray, Menu, nativeTheme } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TrayService {
	#tray = null;
	#window = null;
	#options = null;
	#indicator = false;
	#menu = null;

	constructor(mainWindow, optionsWindow) {
		const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
		this.#window = mainWindow;
		this.#options = optionsWindow;
		this.#tray = new Tray(path.join(__dirname, `../assets/icons/${theme}/tray.png`));

		this.#menu = this.#menuTemplate();
	
		this.#tray.setToolTip('Notion');
		this.#tray.setContextMenu(this.#menu);
	
		this.#tray.on('click', () => {
			this.#window.isVisible() ? this.#window.hide() : this.#window.show();
		});

		this.onUpdateAvailable = this.onUpdateAvailable.bind(this);
		this.onUpdateNotAvailable = this.onUpdateNotAvailable.bind(this);
	}

	#menuTemplate() {
		return Menu.buildFromTemplate([
			{
				label: 'Show App',
				click: () => {
					this.#window.show();
				},
			},
			{ type: 'separator' },
			{
				label: 'Options',
				click: () => {
					this.#options.webContents.send('show-tab', 'options');
					this.#options.show();
				},
			},
			{
				label: 'Updates',
				visible: !this.#indicator,
				click: () => {
					this.#options.webContents.send('show-tab', 'updates');
					this.#options.show();
				},
			},
			{
				label: 'New Update Available',
				visible: this.#indicator,
				icon: path.join(__dirname, '../assets/icons/indicator.png'),
				click: () => {
					this.#options.webContents.send('show-tab', 'updates');
					this.#options.show();
				},
			},
			{
				label: 'About',
				click: () => {
					this.#options.webContents.send('show-tab', 'about');
					this.#options.show();
				},
			},
			{ type: 'separator' },
			{
				label: 'Quit',
				click: () => {
					app.isQuiting = true;
					app.quit();
				},
			},
		]);
	}

	onUpdateAvailable() {
		this.#indicator = true;
		const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
		this.#tray.setImage(path.join(__dirname, `../assets/icons/${theme}/tray-indicator.png`));
		this.#menu = this.#menuTemplate();
		this.#tray.setContextMenu(this.#menu);
	}

	onUpdateNotAvailable() {
		this.#indicator = false;
		const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
		this.#tray.setImage(path.join(__dirname, `../assets/icons/${theme}/tray.png`));
		this.#menu = this.#menuTemplate();
		this.#tray.setContextMenu(this.#menu);
	}
}

export default TrayService;
