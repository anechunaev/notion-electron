import { app } from 'electron';

// Single place that flips the "we really mean to quit" flag — so window-close handlers
// stop intercepting (see MainWindowService) — and then tears the app down.
export function quitApp(): void {
	app.isQuiting = true;
	app.quit();
}

export function relaunchApp(options?: Electron.RelaunchOptions): void {
	app.isQuiting = true;
	app.relaunch(options);
	app.quit();
}
