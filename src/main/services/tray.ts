import { app, Tray, Menu, nativeTheme, type BaseWindow, type BrowserWindow } from 'electron';
import { resolveAsset } from '../lib/resources';

class TrayService {
	private tray: Tray;
	private window: BaseWindow;
	private options: BrowserWindow;
	private indicator = false;
	private menu: Menu;

	constructor(mainWindow: BaseWindow, optionsWindow: BrowserWindow) {
		const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
		this.window = mainWindow;
		this.options = optionsWindow;
		this.tray = new Tray(resolveAsset(`icons/${theme}/tray.png`));

		this.menu = this.menuTemplate();

		this.tray.setToolTip('Notion');
		this.tray.setContextMenu(this.menu);

		this.tray.on('click', () => {
			if (this.window?.isVisible()) {
				this.window.hide();
			} else {
				if (this.window?.isMinimized()) {
					this.window.restore();
				}
				this.window?.show();
			}
		});

		this.onUpdateAvailable = this.onUpdateAvailable.bind(this);
		this.onUpdateNotAvailable = this.onUpdateNotAvailable.bind(this);
	}

	private menuTemplate() {
		return Menu.buildFromTemplate([
			{
				label: 'Show App',
				click: () => {
					this.window.show();
				},
			},
			{ type: 'separator' },
			{
				label: 'Options',
				click: () => {
					this.options.webContents.send('show-tab', 'options');
					this.options.show();
				},
			},
			{
				label: 'Updates',
				visible: !this.indicator,
				click: () => {
					this.options.webContents.send('show-tab', 'updates');
					this.options.show();
				},
			},
			{
				label: 'New Update Available',
				visible: this.indicator,
				icon: resolveAsset('icons/indicator.png'),
				click: () => {
					this.options.webContents.send('show-tab', 'updates');
					this.options.show();
				},
			},
			{
				label: 'About',
				click: () => {
					this.options.webContents.send('show-tab', 'about');
					this.options.show();
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

	public onUpdateAvailable() {
		this.indicator = true;
		const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
		this.tray.setImage(resolveAsset(`icons/${theme}/tray-indicator.png`));
		this.menu = this.menuTemplate();
		this.tray.setContextMenu(this.menu);
	}

	public onUpdateNotAvailable() {
		this.indicator = false;
		const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
		this.tray.setImage(resolveAsset(`icons/${theme}/tray.png`));
		this.menu = this.menuTemplate();
		this.tray.setContextMenu(this.menu);
	}
}

export default TrayService;
