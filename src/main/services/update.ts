import { ipcMain, app, autoUpdater, shell, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { execSync, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getSystemFormattedDate } from '../lib/dateFormat';
import { isSemverBigger } from '../lib/semver';
import { bytesSizeToHuman } from '../lib/bytes';
import { quitApp, relaunchApp } from '../lib/quit';
import type { ChangelogItem } from '../../shared/ipc';
import type { AppStore } from '../types';
import type OptionsService from './options';
import type NotificationService from './notifications';
import type ChangelogService from './changelog';

const ONE_HOUR_MS = 1000 * 60 * 60;
const ONE_DAY_MS = ONE_HOUR_MS * 24;
const ERA_START = new Date(0);

type UpdateStage = 'latest' | 'available' | 'checking' | 'downloading' | 'ready' | 'installing' | 'installed' | 'error';

interface UpdaterInternals {
	doCheckForUpdates(): Promise<unknown>;
	readonly updateInfoAndProvider: { info?: unknown } | null;
	install(isSilent?: boolean, isForceRunAfter?: boolean): boolean;
}

class UpdateService extends EventEmitter {
	private updater = electronUpdater.autoUpdater;
	private optionsWindow: BrowserWindow;
	private store: AppStore;
	private options: OptionsService;
	private lastChecked: string;
	private checkInterval = ONE_DAY_MS;
	private availableVersion: string;
	private localVersion: string;
	private stage: UpdateStage = 'latest';
	private percentage = 0;
	private downloaded = '';
	private total = '';
	private speed = '';
	private error: Error | null = null;
	private notifications: NotificationService;
	private changelog: ChangelogService;

	constructor(
		optionsWindow: BrowserWindow,
		notificationService: NotificationService,
		changelogService: ChangelogService,
		store: AppStore,
		optionsService: OptionsService,
	) {
		super();
		this.optionsWindow = optionsWindow;
		this.store = store;
		this.options = optionsService;
		this.notifications = notificationService;
		this.changelog = changelogService;

		this.localVersion = app.getVersion();
		this.updater.autoDownload = false;
		this.updater.autoInstallOnAppQuit = false;

		this.availableVersion = this.store.get('update-available-version', this.localVersion);
		this.lastChecked = this.store.get('update-last-checked', ERA_START.toISOString());
		this.stage = isSemverBigger(this.availableVersion, this.localVersion) ? 'available' : 'latest';
		switch (this.options.getOption('update-check-interval')) {
			case 'daily':
				this.checkInterval = ONE_DAY_MS;
				break;
			case 'weekly':
				this.checkInterval = ONE_DAY_MS * 7;
				break;
			case 'monthly':
				this.checkInterval = ONE_DAY_MS * 30;
				break;
			default:
				this.checkInterval = Number.MAX_SAFE_INTEGER;
				break;
		}

		if (!this.options.getOption('disable-update-functionality')) {
			this.checkUpdate();
			setInterval(() => {
				this.checkUpdate();
			}, ONE_HOUR_MS);
		}

		setImmediate(() => {
			if (this.stage === 'available') {
				this.emit('update-available', { version: this.availableVersion });
			}
		});

		this.updater.on('checking-for-update', () => {
			this.stage = 'checking';
			this.sendStatus();
		});
		this.updater.on('update-available', (info) => {
			this.emit('update-available', { version: info.version });
			if (this.availableVersion === info.version) return;

			this.availableVersion = info.version;
			this.lastChecked = new Date().toISOString();

			this.store.set('update-last-checked', this.lastChecked);
			this.store.set('update-available-version', this.availableVersion);

			if (this.options.getOption('update-notification')) {
				this.notifications.notify({
					title: 'Update available',
					body: `Version ${this.availableVersion} is available for download.`,
				});
			}

			if (process.env.APPIMAGE && this.options.getOption('update-auto-download')) {
				this.downloadUpdate();
			} else {
				this.stage = isSemverBigger(this.availableVersion, this.localVersion) ? 'available' : 'latest';
				this.sendStatus();
			}
		});
		this.updater.on('update-not-available', (info) => {
			this.lastChecked = new Date().toISOString();
			this.store.set('update-last-checked', this.lastChecked);

			this.emit('update-not-available', { version: info.version });
			this.stage = 'latest';
			this.sendStatus();
		});
		this.updater.on('error', (err) => {
			console.error('>> Error in auto-updater', err);
			this.error = err;
			this.stage = 'error';
			this.sendStatus();
		});
		this.updater.on('download-progress', (progress) => {
			this.stage = 'downloading';
			this.percentage = Math.round(progress.percent);
			this.downloaded = bytesSizeToHuman(progress.transferred);
			this.total = bytesSizeToHuman(progress.total);
			this.speed = `${bytesSizeToHuman(progress.bytesPerSecond)}/s`;
			this.sendStatus();
		});
		this.updater.on('update-downloaded', () => {
			if (process.env.APPIMAGE && this.options.getOption('update-auto-install')) {
				this.installUpdate();
			} else {
				this.stage = 'ready';
				this.sendStatus();
			}
		});

		ipcMain.on('request-update-status', this.sendStatus.bind(this));
		ipcMain.on('check-update-forced', () => this.checkUpdateForced(true));
		ipcMain.on('download-update', this.downloadUpdate.bind(this));
		ipcMain.on('install-update', this.installUpdate.bind(this));
		ipcMain.on('request-changelog', this.fetchChangelog.bind(this));
	}

	private get releaseUrl(): string {
		return `https://github.com/anechunaev/notion-electron/releases/tag/v${this.availableVersion}`;
	}

	private sendStatus() {
		if (!this.optionsWindow || !this.optionsWindow.webContents) return;
		this.optionsWindow.webContents.send('update-status', {
			lastChecked: this.lastChecked,
			lastCheckedFormatted: getSystemFormattedDate(this.lastChecked),
			availableVersion: this.availableVersion,
			localVersion: this.localVersion,
			canAutoUpdate: Boolean(process.env.APPIMAGE),
			releaseUrl: this.releaseUrl,
			stage: this.stage,
			percentage: this.percentage,
			downloaded: this.downloaded,
			total: this.total,
			speed: this.speed,
			error: this.error,
		});
	}

	private checkUpdate(): void {
		if (Date.now() - new Date(this.lastChecked).getTime() > this.checkInterval) {
			this.checkUpdateForced();
		}
	}

	private checkUpdateForced(silent = false) {
		if (!silent) {
			this.stage = 'checking';
			this.sendStatus();
		}

		this.fetchChangelog();

		return (this.updater as unknown as UpdaterInternals).doCheckForUpdates().catch((err) => {
			console.error('>> Error in auto-updater. ', err);
			this.error = err;
			this.stage = 'error';
			this.sendStatus();
		});
	}

	private downloadUpdate() {
		if (!process.env.APPIMAGE) {
			shell.openExternal(this.releaseUrl);
			return;
		}

		this.stage = 'downloading';
		this.percentage = 0;
		this.downloaded = `0 Byte`;
		this.total = `0 Byte`;
		this.speed = `0 Byte/s`;
		this.sendStatus();

		const updater = this.updater as unknown as UpdaterInternals;
		if (updater.updateInfoAndProvider && updater.updateInfoAndProvider.info) {
			this.updater.downloadUpdate();
		} else {
			this.checkUpdateForced(true).then(() => {
				this.updater.downloadUpdate();
			});
		}
	}

	private installUpdate() {
		if (app.isPackaged) {
			this.stage = 'installing';
			this.sendStatus();

			const isInstalled = (this.updater as unknown as UpdaterInternals).install();
			if (isInstalled) {
				this.stage = 'installed';
				this.sendStatus();

				setImmediate(() => {
					autoUpdater.emit('before-quit-for-update');
					if (process.env.APPIMAGE) {
						try {
							execFile(process.env.APPIMAGE, process.argv);
						} catch (relaunchError) {
							console.error('>> Error in auto-updater. ', relaunchError);
						}
						quitApp();
						return;
					}
					relaunchApp();
				});
			}
		} else {
			execSync('rm -rf ~/.cache/notion-electron/pending');
			relaunchApp();
		}
	}

	private fetchChangelog() {
		this.changelog
			.fetch()
			.then((releases) => {
				if (!this.optionsWindow || !this.optionsWindow.webContents) return;
				const items: ChangelogItem[] = releases.map((release) => ({
					version: release.version,
					dateFormatted: getSystemFormattedDate(release.date),
					notes: release.notes,
					url: release.url,
				}));
				this.optionsWindow.webContents.send('update-changelog', items);
			})
			.catch((error) => {
				console.error('Error fetching changelog:', error);
			});
	}
}

export default UpdateService;
