import { ipcMain, app, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class OptionsService {
	#window = null;
	#options = null;
	#config = null;
	#store = null;

	constructor(mainWindow, optionsWindow, store) {
		this.#window = mainWindow;
		this.#options = optionsWindow;
		this.#store = store;
		this.#config = JSON.parse(readFileSync(path.join(__dirname, '../options.json'), 'utf8'));

		this.#options.webContents.setWindowOpenHandler(({ url }) => {
			shell.openExternal(url);
			return { action: 'deny' };
		});

		Object.keys(this.#config.options).forEach((optionId) => {
			this.#config.options[optionId].value.data = this.#store.get(optionId, this.#config.options[optionId].value.default);
		});

		ipcMain.on('restart', this.#restartApp.bind(this));

		ipcMain.on('get-app-metadata', this.#sendAppMetadata.bind(this));

		ipcMain.on('get-options', (event) => {
			this.#options.webContents.send('options', this.#config);
		});

		ipcMain.on('close-window', () => {
			this.#options.close();
		});

		ipcMain.on('set-option', (event, optionId, value) => {
			this.setOption(optionId, value);
		});
	}

	#sendAppMetadata(event) {
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

	getOption(optionId) {
		return this.#config.options[optionId];
	}

	setOption(optionId, value) {
		const option = this.getOption(optionId);
		this.#store.set(optionId, value);
		option.value.data = value;
	}
}

export default OptionsService;
