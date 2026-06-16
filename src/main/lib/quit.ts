import { app } from 'electron';

export function quitApp(): void {
	app.isQuiting = true;
	app.quit();
}

export function relaunchApp(options?: Electron.RelaunchOptions): void {
	app.isQuiting = true;
	app.relaunch(options);
	app.quit();
}
