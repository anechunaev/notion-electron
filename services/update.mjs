import { ipcMain, app, autoUpdater, shell } from "electron";
import electronUpdater from "electron-updater";
import { execSync, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';

const ONE_HOUR_MS = 1000 * 60 * 60;
const ONE_DAY_MS = ONE_HOUR_MS * 24;
const ERA_START = new Date(0);

class UpdateService extends EventEmitter {
	#updater = electronUpdater.autoUpdater;
	#optionsWindow = null;
	#store = null;
	#lastChecked = null;
	#checkInterval = ONE_DAY_MS;
	#availableVersion = null;
	#localVersion = null;
	#stage = 'latest';
	#percentage = 0;
	#downloaded = '';
	#total = '';
	#speed = '';
	#error = null;

	constructor(optionsWindow, store) {
		super();
		this.#optionsWindow = optionsWindow;
		this.#store = store;

		this.#localVersion = app.getVersion();
		this.#updater.autoDownload = false;
		this.#updater.autoInstallOnAppQuit = false;

		this.#availableVersion = this.#store.get('update-available-version', this.#localVersion);
		this.#lastChecked = this.#store.get('update-last-checked', ERA_START.toISOString());
		this.#stage = this.#semverIsBigger(this.#availableVersion, this.#localVersion) ? 'available' : 'latest';
		switch(this.#store.get('update-check-interval', 'daily')) {
		case 'daily':
			this.#checkInterval = ONE_DAY_MS;
			break;
		case 'weekly':
			this.#checkInterval = ONE_DAY_MS * 7;
			break;
		case 'monthly':
			this.#checkInterval = ONE_DAY_MS * 30;
			break;
		default:
			this.#checkInterval = Number.MAX_SAFE_INTEGER;
			break;
		}

		this.#checkUpdate();
		setInterval(() => {
			this.#checkUpdate();
		}, ONE_HOUR_MS);

		setImmediate(() => {
			if (this.#stage === 'available') {
				this.emit('update-available', { version: this.#availableVersion });
			}
		});

		this.#updater.on('checking-for-update', () => {
			this.#stage = 'checking';
			this.#sendStatus();
		});
		this.#updater.on('update-available', (info) => {
			this.emit('update-available', { version: info.version });
			if (this.#availableVersion === info.version) return;

			this.#availableVersion = info.version;
			this.#lastChecked = (new Date()).toISOString();

			this.#store.set('update-last-checked', this.#lastChecked);
			this.#store.set('update-available-version', this.#availableVersion);

			if (process.env.APPIMAGE && store.get('update-auto-download', false)) {
				this.#downloadUpdate();
			} else {
				this.#stage = this.#semverIsBigger(this.#availableVersion, this.#localVersion) ? 'available' : 'latest';
				this.#sendStatus();
			}
		});
		this.#updater.on('update-not-available', (info) => {
			this.#lastChecked = (new Date()).toISOString();
			this.#store.set('update-last-checked', this.#lastChecked);

			this.emit('update-not-available', { version: info.version });
			this.#stage = 'latest';
			this.#sendStatus();
		});
		this.#updater.on('error', (err) => {
			console.error('>> Error in auto-updater', err);
			this.#error = err;
			this.#stage = 'error';
			this.#sendStatus();
		});
		this.#updater.on('download-progress', (progress) => {
			this.#stage = 'downloading';
			this.#percentage = Math.round(progress.percent);
			this.#downloaded = this.#bytesSizeToHuman(progress.transferred);
			this.#total = this.#bytesSizeToHuman(progress.total);
			this.#speed = `${this.#bytesSizeToHuman(progress.bytesPerSecond)}/s`;
			this.#sendStatus();
		});
		this.#updater.on('update-downloaded', (info) => {
			if (process.env.APPIMAGE && store.get('update-auto-install', false)) {
				this.#installUpdate();
			} else {
				this.#stage = 'ready';
				this.#sendStatus();
			}
		});

		ipcMain.on("request-update-status", () => {
			this.#sendStatus();
		});

		ipcMain.on("check-update-forced", () => {
			this.#checkUpdateForced();
		});

		ipcMain.on("download-update", () => {
			this.#downloadUpdate();
		});

		ipcMain.on("install-update", () => {
			this.#installUpdate();
		});
	}

	#sendStatus() {
		if (!this.#optionsWindow || !this.#optionsWindow.webContents) return;
		this.#optionsWindow.webContents.send("update-status", {
			lastChecked: this.#lastChecked,
			lastCheckedFormatted: this.#getSystemFormattedDate(this.#lastChecked),
			availableVersion: this.#availableVersion,
			localVersion: this.#localVersion,
			stage: this.#stage,
			percentage: this.#percentage,
			downloaded: this.#downloaded,
			total: this.#total,
			speed: this.#speed,
			error: this.#error,
		});
	}

	#semverIsBigger(a, b) {
		const av = a.split('-');
		const bv = b.split('-');
		const [aMajor, aMinor, aPatch] = av[0].split('.').map(Number);
		const [bMajor, bMinor, bPatch] = bv[0].split('.').map(Number);

		return aMajor > bMajor || aMinor > bMinor || aPatch > bPatch;
	}

	#checkUpdate() {
		if (Date.now() - new Date(this.#lastChecked).getTime() > this.#checkInterval) {
			this.#checkUpdateForced();
		}
	}

	#checkUpdateForced(silent = false) {
		if (!silent) {
			this.#stage = 'checking';
			this.#sendStatus();
		}

		return this.#updater.doCheckForUpdates()
			.catch((err) => {
				console.error('>> Error in auto-updater. ', err);
				this.#error = err;
				this.#stage = 'error';
				this.#sendStatus();
			});
	}

	#downloadUpdate() {
		if (!process.env.APPIMAGE) {
			shell.openExternal(`https://github.com/anechunaev/notion-electron/releases/tag/v${this.#availableVersion}`);
			return;
		}

		this.#stage = 'downloading';
		this.#percentage = 0;
		this.#downloaded = `0 Byte`;
		this.#total = `0 Byte`;
		this.#speed = `0 Byte/s`;
		this.#sendStatus();

		if (this.#updater.updateInfoAndProvider && this.#updater.updateInfoAndProvider.info) {
			this.#updater.downloadUpdate();
		} else {
			this.#checkUpdateForced(true).then(() => {
				this.#updater.downloadUpdate();
			});
		}
	}

	#installUpdate() {
		if (app.isPackaged) {
			this.#stage = 'installing';
			this.#sendStatus();

			const isInstalled = this.#updater.install();
			if (isInstalled) {
				this.stage = 'installed';
				this.#sendStatus();

				setImmediate(() => {
					autoUpdater.emit("before-quit-for-update");
					if (process.env.APPIMAGE) {
						execFile(process.env.APPIMAGE, process.argv);
						app.isQuiting = true;
						app.quit();
						return;
					}
					app.isQuiting = true;
					app.relaunch();
					app.quit();
				});
			}
		} else {
			app.isQuiting = true;
			execSync('rm -rf ~/.cache/notion-electron/pending');
			app.relaunch();
			app.quit();
		}
	}

	#bytesSizeToHuman(bytes) {
		const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
		if (bytes == 0) return '0 Byte';
		const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
		return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
	}

	#getSystemFormattedDate(dateString) {
		const dateObject = dateString ? new Date(dateString) : new Date();
		const isoString = dateObject.toISOString();
		try {
			return execSync(`date -d ${isoString}`).toString().trim();
		} catch (error) {
			return dateObject.toLocaleString();
		}
	}
}

export default UpdateService;
