import { app } from 'electron';
import { spawn } from 'node:child_process';
import { detectPackageFormat } from './packaging';

export function quitApp(): void {
	app.isQuiting = true;
	app.quit();
}

export function relaunchApp(options?: Electron.RelaunchOptions): void {
	app.isQuiting = true;

	// AppImage mounts itself at a temporary FUSE mountpoint that gets torn down as soon as this
	// process exits, so app.relaunch()'s default execPath (pointing inside that mount) is gone
	// before the new process can start. Re-exec the outer .AppImage file itself instead, which
	// stays on disk. `npm start` sets APPIMAGE=/ to keep the in-app-update UI testable in dev, so
	// isPackaged guards against trying to exec that placeholder path.
	if (app.isPackaged && detectPackageFormat() === 'appimage' && process.env.APPIMAGE) {
		try {
			spawn(process.env.APPIMAGE, process.argv.slice(1), { detached: true, stdio: 'ignore' }).unref();
		} catch (error) {
			console.error('>> Error relaunching AppImage. ', error);
		}
		app.quit();
		return;
	}

	app.relaunch(options);
	app.quit();
}
