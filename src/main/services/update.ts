import { ipcMain, app, autoUpdater, shell, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { execSync, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getSystemFormattedDate } from '../lib/dateFormat';
import type { AppStore } from '../types';
import type OptionsService from './options';
import type NotificationService from './notifications';
import type ChangelogService from './changelog';

const ONE_HOUR_MS = 1000 * 60 * 60;
const ONE_DAY_MS = ONE_HOUR_MS * 24;
const ERA_START = new Date(0);

type UpdateStage = 'latest' | 'available' | 'checking' | 'downloading' | 'ready' | 'installing' | 'installed' | 'error';

// Parse the major/minor/patch of a semver string (ignoring any prerelease suffix).
function parseSemver(version: string): [number, number, number] {
	const [major = 0, minor = 0, patch = 0] = (version.split('-')[0] ?? '').split('.').map(Number);
	return [major, minor, patch];
}

// electron-updater's exported `autoUpdater` is typed as the abstract AppUpdater,
// which hides a few members this service relies on at runtime.
interface UpdaterInternals {
	doCheckForUpdates(): Promise<unknown>;
	readonly updateInfoAndProvider: { info?: unknown } | null;
	install(isSilent?: boolean, isForceRunAfter?: boolean): boolean;
}

class UpdateService extends EventEmitter {
	#updater = electronUpdater.autoUpdater;
	#optionsWindow: BrowserWindow;
	#store: AppStore;
	#options: OptionsService;
	#lastChecked: string;
	#checkInterval = ONE_DAY_MS;
	#availableVersion: string;
	#localVersion: string;
	#stage: UpdateStage = 'latest';
	#percentage = 0;
	#downloaded = '';
	#total = '';
	#speed = '';
	#error: Error | null = null;
	#notifications: NotificationService;
	#changelog: ChangelogService;

	constructor(
		optionsWindow: BrowserWindow,
		notificationService: NotificationService,
		changelogService: ChangelogService,
		store: AppStore,
		optionsService: OptionsService,
	) {
		super();
		this.#optionsWindow = optionsWindow;
		this.#store = store;
		this.#options = optionsService;
		this.#notifications = notificationService;
		this.#changelog = changelogService;

		this.#localVersion = app.getVersion();
		this.#updater.autoDownload = false;
		this.#updater.autoInstallOnAppQuit = false;

		this.#availableVersion = this.#store.get('update-available-version', this.#localVersion);
		this.#lastChecked = this.#store.get('update-last-checked', ERA_START.toISOString());
		this.#stage = this.#semverIsBigger(this.#availableVersion, this.#localVersion) ? 'available' : 'latest';
		switch (this.#options.getOption('update-check-interval')) {
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

		if (!this.#options.getOption('disable-update-functionality')) {
			this.#checkUpdate();
			setInterval(() => {
				this.#checkUpdate();
			}, ONE_HOUR_MS);
		}

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
			this.#lastChecked = new Date().toISOString();

			this.#store.set('update-last-checked', this.#lastChecked);
			this.#store.set('update-available-version', this.#availableVersion);

			if (this.#options.getOption('update-notification')) {
				this.#notifications.notify({
					title: 'Update available',
					body: `Version ${this.#availableVersion} is available for download.`,
				});
			}

			if (process.env.APPIMAGE && this.#options.getOption('update-auto-download')) {
				this.#downloadUpdate();
			} else {
				this.#stage = this.#semverIsBigger(this.#availableVersion, this.#localVersion) ? 'available' : 'latest';
				this.#sendStatus();
			}
		});
		this.#updater.on('update-not-available', (info) => {
			this.#lastChecked = new Date().toISOString();
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
		this.#updater.on('update-downloaded', () => {
			if (process.env.APPIMAGE && this.#options.getOption('update-auto-install')) {
				this.#installUpdate();
			} else {
				this.#stage = 'ready';
				this.#sendStatus();
			}
		});

		ipcMain.on('request-update-status', this.#sendStatus.bind(this));
		// Previously bound directly, which passed the IpcMainEvent as `silent`
		// (truthy) — preserve that silent behavior explicitly.
		ipcMain.on('check-update-forced', () => this.#checkUpdateForced(true));
		ipcMain.on('download-update', this.#downloadUpdate.bind(this));
		ipcMain.on('install-update', this.#installUpdate.bind(this));
		ipcMain.on('request-changelog', this.#fetchChangelog.bind(this));
	}

	#sendStatus() {
		if (!this.#optionsWindow || !this.#optionsWindow.webContents) return;
		this.#optionsWindow.webContents.send('update-status', {
			lastChecked: this.#lastChecked,
			lastCheckedFormatted: getSystemFormattedDate(this.#lastChecked),
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

	#semverIsBigger(a: string, b: string): boolean {
		const [aMajor, aMinor, aPatch] = parseSemver(a);
		const [bMajor, bMinor, bPatch] = parseSemver(b);

		return aMajor > bMajor || aMinor > bMinor || aPatch > bPatch;
	}

	#checkUpdate(): void {
		if (Date.now() - new Date(this.#lastChecked).getTime() > this.#checkInterval) {
			this.#checkUpdateForced();
		}
	}

	#checkUpdateForced(silent = false) {
		if (!silent) {
			this.#stage = 'checking';
			this.#sendStatus();
		}

		this.#fetchChangelog();

		return (this.#updater as unknown as UpdaterInternals).doCheckForUpdates().catch((err) => {
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

		const updater = this.#updater as unknown as UpdaterInternals;
		if (updater.updateInfoAndProvider && updater.updateInfoAndProvider.info) {
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

			const isInstalled = (this.#updater as unknown as UpdaterInternals).install();
			if (isInstalled) {
				this.#stage = 'installed';
				this.#sendStatus();

				setImmediate(() => {
					autoUpdater.emit('before-quit-for-update');
					if (process.env.APPIMAGE) {
						try {
							execFile(process.env.APPIMAGE, process.argv);
						} catch (relaunchError) {
							console.error('>> Error in auto-updater. ', relaunchError);
						}
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

	#bytesSizeToHuman(bytes: number): string {
		const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
		if (bytes === 0) return '0 Byte';
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return Math.round(bytes / Math.pow(1024, i)) + ' ' + (sizes[i] ?? '');
	}

	#fetchChangelog() {
		this.#changelog
			.fetch()
			.then((releases) => {
				return this.#changelog.html(releases);
			})
			.then((html) => {
				if (!this.#optionsWindow || !this.#optionsWindow.webContents) return;
				this.#optionsWindow.webContents.send('update-changelog', html);
			})
			.catch((error) => {
				console.error('Error fetching changelog:', error);
			});
	}
}

export default UpdateService;
