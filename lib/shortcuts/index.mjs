import { functionalKeymap } from './functional.mjs';
import { actionKeymap } from './action.mjs';

function toTitleCase(str) {
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export const shortcutMap = { ...functionalKeymap, ...actionKeymap };

export function detectShortcut(input, event, pageWebContents, titlebarWebContents) {
	const accelerator = [];
	if (input.control) accelerator.push('CmdOrCtrl');
	if (input.shift) accelerator.push('Shift');
	if (input.alt) accelerator.push('Alt');
	if (input.meta) accelerator.push('Meta');
	accelerator.push(input.key.length === 1 ? toTitleCase(input.key) : input.key);
	const accelString = accelerator.join('+');
	const shortcut = Object.values(shortcutMap).find(s => s.accelerator === accelString);
	if (shortcut) {
		shortcut.action({
			pageWebContents,
			titlebarWebContents,
		});
		event.preventDefault();
	}
}
