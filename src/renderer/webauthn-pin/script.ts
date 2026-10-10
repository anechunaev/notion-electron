import type { WebAuthnPinRequest } from '../../shared/ipc';

const REASON_MESSAGES: Record<WebAuthnPinRequest['reason'], string> = {
	challenge: 'Enter the PIN of your security key to sign in to %s.',
	set: 'Your security key requires a PIN before it can be used with %s. Set a new PIN.',
	change: 'The PIN of your security key must be changed before it can be used with %s. Enter a new PIN.',
};

const ERROR_MESSAGES: Record<string, string> = {
	'wrong-pin': 'Wrong PIN.',
	'too-short': 'The PIN is too short.',
	'invalid-characters': 'The PIN contains invalid characters.',
	'same-as-current-pin': 'The new PIN must be different from the current one.',
	'internal-uv-locked': 'Built-in verification is locked; enter the PIN instead.',
};

const message = document.getElementById('message') as HTMLParagraphElement;
const errorLine = document.getElementById('error') as HTMLParagraphElement;
const form = document.getElementById('pin-form') as HTMLFormElement;
const pinInput = document.getElementById('pin') as HTMLInputElement;
const cancelButton = document.getElementById('cancel') as HTMLButtonElement;

window.notionElectronWebAuthnAPI.subscribeOnPinRequest((request) => {
	message.textContent = REASON_MESSAGES[request.reason].replace('%s', request.relyingPartyId);
	if (request.reason !== 'challenge') {
		pinInput.minLength = request.minPinLength;
	}

	const details: string[] = [];
	if (request.error) {
		details.push(ERROR_MESSAGES[request.error] ?? 'The PIN was rejected.');
	}
	if (request.attemptsRemaining !== null) {
		details.push(`${request.attemptsRemaining} attempts remaining before the key locks.`);
	}
	errorLine.textContent = details.join(' ');
	errorLine.classList.toggle('hidden', details.length === 0);
	pinInput.focus();
});

form.addEventListener('submit', (event) => {
	event.preventDefault();
	if (pinInput.value.length > 0) {
		window.notionElectronWebAuthnAPI.submitPin(pinInput.value);
	}
});

cancelButton.addEventListener('click', () => {
	window.notionElectronWebAuthnAPI.cancel();
});
