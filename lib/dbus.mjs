import DBusNext from 'dbus-next';

export function getDBusInterface(optionsWindow = null) {
	return class Interface extends DBusNext.interface.Interface {
		#optionsWindow = optionsWindow;
		$methods = [
			{
				name: 'Options',
				fn: this.Options.bind(this),
				disabled: false,
				inSignature: '',
				outSignature: '',
				inSignatureTree: [],
				outSignatureTree: [],
			},
			{
				name: 'Updates',
				fn: this.Updates.bind(this),
				disabled: false,
				inSignature: '',
				outSignature: '',
				inSignatureTree: [],
				outSignatureTree: [],
			},
			{
				name: 'About',
				fn: this.About.bind(this),
				disabled: false,
				inSignature: '',
				outSignature: '',
				inSignatureTree: [],
				outSignatureTree: [],
			},
		];

		Options() {
			if (this.#optionsWindow) {
				this.#optionsWindow.webContents.send('show-tab', 'options');
				this.#optionsWindow.show();
			}
			return true;
		}

		Updates() {
			if (this.#optionsWindow) {
				this.#optionsWindow.webContents.send('show-tab', 'updates');
				this.#optionsWindow.show();
			}
			return true;
		}

		About() {
			if (this.#optionsWindow) {
				this.#optionsWindow.webContents.send('show-tab', 'about');
				this.#optionsWindow.show();
			}
			return true;
		}
	}
}
