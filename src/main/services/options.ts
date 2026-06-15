import { ipcMain, shell, type BrowserWindow } from 'electron';
import type EventEmitter from 'node:events';
import pkg from '../../../package.json';
import { relaunchApp } from '../lib/quit';
import type { AppStore, OptionsConfig, OptionValues } from '../types';

class OptionsService {
	private options: BrowserWindow | null = null;
	private config: OptionsConfig;
	private store: AppStore;
	private cliOverrides: Partial<OptionValues> = {};
	private envDefaults: Partial<OptionValues> = {};
	private mainBus: EventEmitter;

	private static DE_PRESETS: Record<string, Partial<OptionValues>> = {
		gnome: {
			'hide-to-tray': false,
			'hide-window-on-close': false,
		},
	};

	private static buildEnvDefaults(env: NodeJS.ProcessEnv): Partial<OptionValues> {
		const de = env.XDG_SESSION_DESKTOP?.toLowerCase();
		return de && de in OptionsService.DE_PRESETS ? { ...OptionsService.DE_PRESETS[de] } : {};
	}

	constructor(
		store: AppStore,
		config: OptionsConfig,
		mainBus: EventEmitter,
		argv: string[] = process.argv,
		env: NodeJS.ProcessEnv = process.env,
	) {
		this.store = store;
		this.config = config;
		this.mainBus = mainBus;
		this.envDefaults = OptionsService.buildEnvDefaults(env);

		if (argv.includes('--hide-on-startup')) this.cliOverrides['general-show-window-on-start'] = false;
		if (argv.includes('--disable-spellcheck')) this.cliOverrides['general-enable-spellcheck'] = false;
		if (argv.includes('--disable-update-functionality')) this.cliOverrides['disable-update-functionality'] = true;

		ipcMain.on('restart', this.restartApp.bind(this));

		ipcMain.on('get-app-metadata', this.sendAppMetadata.bind(this));

		ipcMain.on('get-options', () => {
			if (!this.options) return;
			const payload = {
				groups: this.config.groups,
				options: Object.fromEntries(
					Object.entries(this.config.options).map(([id, opt]) => [
						id,
						{ ...opt, value: { ...opt.value, data: this.getPersistentOption(id as keyof OptionValues) } },
					]),
				),
			};
			this.options.webContents.send('options', payload);
		});

		ipcMain.on('close-window', () => {
			if (this.options) {
				this.options.close();
			}
		});

		ipcMain.on('set-option', (event, optionId: string, value: unknown) => {
			this.setPersistentOption(optionId, value);
		});
	}

	private sendAppMetadata(): void {
		if (!this.options) return;
		this.options.webContents.send('app-metadata', {
			version: pkg.version,
			author: pkg.author,
			license: pkg.license,
			description: pkg.description,
		});
	}

	private restartApp(): void {
		relaunchApp();
	}

	public setOptionsWindow(optionsWindow: BrowserWindow): void {
		this.options = optionsWindow;
		this.options.webContents.setWindowOpenHandler(({ url }) => {
			shell.openExternal(url);
			return { action: 'deny' };
		});
	}

	public getOption<K extends keyof OptionValues>(optionId: K): OptionValues[K] {
		if (optionId in this.cliOverrides) return this.cliOverrides[optionId] as OptionValues[K];
		return this.getPersistentOption(optionId);
	}

	public getPersistentOption<K extends keyof OptionValues>(optionId: K): OptionValues[K] {
		const configDefault = this.config.options[optionId]?.value.default;
		const fallback = optionId in this.envDefaults ? this.envDefaults[optionId] : configDefault;
		return this.store.get(optionId, fallback) as OptionValues[K];
	}

	public setOption(optionId: string, value: unknown): void {
		this.store.set(optionId, value);

		if (this.mainBus) {
			this.mainBus.emit('option-changed', optionId, value);
		}
	}

	public setPersistentOption(optionId: string, value: unknown): void {
		this.setOption(optionId, value);
	}
}

export default OptionsService;
