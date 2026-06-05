import { ipcMain, app, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class OptionsService {
	#options = null;
	#config = null;
	#store = null;
	#cliOverrides = {};
	#envDefaults = {};

	static #DE_PRESETS = {
		gnome: {
			'hide-to-tray': false,
			'hide-window-on-close': false,
		},
	};

	static #buildEnvDefaults(env) {
		const de = env.XDG_SESSION_DESKTOP?.toLowerCase();
		return de && de in OptionsService.#DE_PRESETS ? { ...OptionsService.#DE_PRESETS[de] } : {};
	}

	constructor(store, config, argv = process.argv, env = process.env) {
		this.#store = store;
		this.#config = config;

		this.#envDefaults = OptionsService.#buildEnvDefaults(env);

		if (argv.includes('--hide-on-startup')) this.#cliOverrides['general-show-window-on-start'] = false;
		if (argv.includes('--disable-spellcheck')) this.#cliOverrides['general-enable-spellcheck'] = false;
		if (argv.includes('--disable-update-functionality')) this.#cliOverrides['disable-update-functionality'] = true;

		ipcMain.on('restart', this.#restartApp.bind(this));

		ipcMain.on('get-app-metadata', this.#sendAppMetadata.bind(this));

		ipcMain.on('get-options', (event) => {
			if (!this.#options) return;
			const payload = {
				groups: this.#config.groups,
				options: Object.fromEntries(
					Object.entries(this.#config.options).map(([id, opt]) => [
						id,
						{ ...opt, value: { ...opt.value, data: this.getPersistentOption(id) } },
					]),
				),
			};
			this.#options.webContents.send('options', payload);
		});

		ipcMain.on('close-window', () => {
			if (this.#options) {
				this.#options.close();
			}
		});

		ipcMain.on('set-option', (event, optionId, value) => {
			this.setPersistentOption(optionId, value);
		});
	}

	#sendAppMetadata(event) {
		if (!this.#options) return;
		const pkg = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
		this.#options.webContents.send('app-metadata', {
			version: pkg.version,
			author: pkg.author,
			license: pkg.license,
			description: pkg.description,
		});
	}

	#restartApp() {
		app.isQuiting = true;
		app.relaunch();
		app.quit();
	}

	setOptionsWindow(optionsWindow) {
		this.#options = optionsWindow;
		this.#options.webContents.setWindowOpenHandler(({ url }) => {
			shell.openExternal(url);
			return { action: 'deny' };
		});
	}

	getOption(optionId) {
		if (optionId in this.#cliOverrides) return this.#cliOverrides[optionId];
		return this.getPersistentOption(optionId);
	}

	getPersistentOption(optionId) {
		const configDefault = this.#config.options[optionId].value.default;
		const fallback = optionId in this.#envDefaults ? this.#envDefaults[optionId] : configDefault;
		return this.#store.get(optionId, fallback);
	}

	setOption(optionId, value) {
		this.#store.set(optionId, value);
	}

	setPersistentOption(optionId, value) {
		this.setOption(optionId, value);
	}
}

export default OptionsService;
