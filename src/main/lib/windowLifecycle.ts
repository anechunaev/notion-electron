import { app, type BaseWindow, type BrowserWindow } from 'electron';

interface MainWindowLifecycleHandlers {
	shouldHideToTray: () => boolean;
	shouldHideOnClose: () => boolean;
	onBeforeQuit?: () => void;
}

export function registerMainWindowLifecycle(
	mainWindow: BaseWindow,
	{ shouldHideToTray, shouldHideOnClose, onBeforeQuit = () => {} }: MainWindowLifecycleHandlers,
): void {
	mainWindow.on('minimize', (event?: Electron.Event) => {
		if (shouldHideToTray()) {
			event?.preventDefault();
			mainWindow.hide();
		}
	});

	mainWindow.on('close', (event: Electron.Event) => {
		if (!app.isQuiting && shouldHideOnClose()) {
			event.preventDefault();
			mainWindow.hide();
			return;
		}
		try {
			onBeforeQuit();
		} catch (e) {
			console.warn(e);
		} finally {
			app.quit();
			process.exit(0);
		}
	});

	app.on('window-all-closed', (event?: Electron.Event) => {
		if (shouldHideOnClose()) {
			event?.preventDefault();
		} else {
			app.quit();
			process.exit(0);
		}
	});
}

export function registerOptionsWindowLifecycle(optionsWindow: BrowserWindow): void {
	optionsWindow.on('close', (event) => {
		if (!app.isQuiting) {
			event.preventDefault();
			optionsWindow.hide();
		}
	});
}
