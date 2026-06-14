import { app, type BaseWindow, type BrowserWindow } from 'electron';
import type OptionsService from './options';

class MainWindowService {
	private mainWindow: BaseWindow;
	private options: OptionsService;
	private onBeforeQuit: () => void;

	constructor(mainWindow: BaseWindow, optionsService: OptionsService, onBeforeQuit: () => void = () => {}) {
		this.mainWindow = mainWindow;
		this.options = optionsService;
		this.onBeforeQuit = onBeforeQuit;

		this.mainWindow.on('minimize', (event?: Electron.Event) => {
			if (this.options.getOption('hide-to-tray')) {
				event?.preventDefault();
				this.mainWindow.hide();
			}
		});

		this.mainWindow.on('close', (event: Electron.Event) => {
			if (!app.isQuiting && this.options.getOption('hide-window-on-close')) {
				event.preventDefault();
				this.mainWindow.hide();
				return;
			}
			try {
				this.onBeforeQuit();
			} catch (e) {
				console.warn(e);
			} finally {
				app.quit();
				process.exit(0);
			}
		});

		app.on('window-all-closed', (event?: Electron.Event) => {
			if (this.options.getOption('hide-window-on-close')) {
				event?.preventDefault();
			} else {
				app.quit();
				process.exit(0);
			}
		});
	}

	// eslint-disable-next-line publicMethods/public-class-methods-use-this
	public manageOptionsWindow(optionsWindow: BrowserWindow): void {
		optionsWindow.on('close', (event) => {
			if (!app.isQuiting) {
				event.preventDefault();
				optionsWindow.hide();
			}
		});
	}
}

export default MainWindowService;
