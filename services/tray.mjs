import { app, Tray, Menu } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TrayService {
	#tray = null;
	#window = null;
	#options = null;

	constructor(mainWindow, optionsWindow) {
		this.#window = mainWindow;
		this.#options = optionsWindow;
		this.#tray = new Tray(path.join(__dirname, '../assets/icons/tray.png'));
		
		const contextMenu = Menu.buildFromTemplate([
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
	
		this.#tray.setToolTip('Notion');
		this.#tray.setContextMenu(contextMenu);
	
		this.#tray.on('click', () => {
			this.#window.isVisible() ? this.#window.hide() : this.#window.show();
		});
	}
}

export default TrayService;
