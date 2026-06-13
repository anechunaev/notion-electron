import type { Event, Input, WebContents } from 'electron';
import { functionalKeymap } from './functional';
import { actionKeymap } from './action';

function toTitleCase(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export const shortcutMap = { ...functionalKeymap, ...actionKeymap };

export function detectShortcut(
	input: Input,
	event: Event,
	pageWebContents: WebContents | undefined,
	titlebarWebContents: WebContents,
) {
	const accelerator: string[] = [];
	if (input.control) accelerator.push('CmdOrCtrl');
	if (input.shift) accelerator.push('Shift');
	if (input.alt) accelerator.push('Alt');
	if (input.meta) accelerator.push('Meta');
	accelerator.push(input.key.length === 1 ? toTitleCase(input.key) : input.key);
	const accelString = accelerator.join('+');
	const shortcut = Object.values(shortcutMap).find((s) => s.accelerator === accelString);
	if (shortcut) {
		shortcut.action({
			pageWebContents,
			titlebarWebContents,
		});
		event.preventDefault();
	}
}
