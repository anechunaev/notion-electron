import { ipcMain, app, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class OptionsService {
	#options = null;
	#config = null;
	#store = null;

	constructor(store) {
		this.#store = store;
		this.#config = JSON.parse(readFileSync(path.join(__dirname, '../options.json'), 'utf8'));

		Object.keys(this.#config.options).forEach((optionId) => {
			this.#config.options[optionId].value.data = this.#store.get(optionId, this.#config.options[optionId].value.default);
		});

		ipcMain.on('restart', this.#restartApp.bind(this));

		ipcMain.on('get-app-metadata', this.#sendAppMetadata.bind(this));

		ipcMain.on('get-options', (event) => {
			if (this.#options) {
				this.#options.webContents.send('options', this.#config);
			}
		});

		ipcMain.on('close-window', () => {
			if (this.#options) {
				this.#options.close();
			}
		});

		ipcMain.on('set-option', (event, optionId, value) => {
			this.setOption(optionId, value);
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
		return this.#config.options[optionId].value;
	}

	setOption(optionId, value) {
		const optionValue = this.getOption(optionId);
		this.#store.set(optionId, value);
		optionValue.data = value;
	}
}

export default OptionsService;
