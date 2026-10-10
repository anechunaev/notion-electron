import { BrowserWindow, dialog, ipcMain, session } from 'electron';
import { loadRendererPage, resolvePreload } from '../lib/resources';
import type { WebAuthnPinRequest } from '../../shared/ipc';

export default class WebAuthnService {
	private pinWindow: BrowserWindow | null = null;
	private pinCallback: ((pin: string | null) => void) | null = null;

	constructor() {
		session.defaultSession.on('select-webauthn-account', (event, details, callback) => {
			this.selectAccount(details.relyingPartyId, details.accounts, callback);
		});

		// The 'collect-webauthn-pin' event is not in Electron's typings yet; it ships
		// with https://github.com/electron/electron/pull/53351. Registering the
		// listener is a no-op on older Electron versions and enables security-key
		// PIN collection as soon as the runtime supports it.
		(session.defaultSession as unknown as NodeJS.EventEmitter).on(
			'collect-webauthn-pin',
			(event: unknown, details: WebAuthnPinRequest, callback: (pin?: string | null) => void) => {
				this.collectPin(details, callback);
			},
		);

		ipcMain.on('webauthn-pin-submit', (event, pin: unknown) => {
			this.resolvePin(typeof pin === 'string' && pin.length > 0 ? pin : null);
		});
		ipcMain.on('webauthn-pin-cancel', () => {
			this.resolvePin(null);
		});
	}

	private async selectAccount(
		relyingPartyId: string,
		accounts: Electron.WebAuthnAccount[],
		callback: (credentialId?: string | null) => void,
	): Promise<void> {
		let credentialId: string | null = null;
		try {
			if (accounts.length === 1) {
				credentialId = accounts[0]?.credentialId ?? null;
			} else if (accounts.length > 1) {
				const labels = accounts.map(
					(account, index) => account.displayName ?? account.name ?? `Account ${index + 1}`,
				);
				const { response } = await dialog.showMessageBox({
					type: 'question',
					title: 'Choose a passkey',
					message: `Choose an account to sign in to ${relyingPartyId}`,
					buttons: labels.concat('Cancel'),
					cancelId: labels.length,
				});
				credentialId = accounts[response]?.credentialId ?? null;
			}
		} finally {
			callback(credentialId);
		}
	}

	private collectPin(request: WebAuthnPinRequest, callback: (pin?: string | null) => void): void {
		this.pinCallback = (pin) => {
			callback(pin);
		};
		this.pinWindow = new BrowserWindow({
			width: 420,
			height: 300,
			resizable: false,
			minimizable: false,
			maximizable: false,
			alwaysOnTop: true,
			autoHideMenuBar: true,
			title: 'Security Key PIN',
			webPreferences: {
				preload: resolvePreload('webauthnPin.cjs'),
			},
		});
		this.pinWindow.on('closed', () => {
			this.pinWindow = null;
			this.resolvePin(null);
		});
		const contents = this.pinWindow.webContents;
		loadRendererPage(this.pinWindow, 'webauthn-pin').then(() => {
			contents.send('webauthn-pin-request', request);
		});
	}

	private resolvePin(pin: string | null): void {
		const callback = this.pinCallback;
		this.pinCallback = null;
		callback?.(pin);
		this.pinWindow?.close();
		this.pinWindow = null;
	}
}
