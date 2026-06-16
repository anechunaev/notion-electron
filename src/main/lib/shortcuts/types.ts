import type { WebContents } from 'electron';

export interface ShortcutContext {
	pageWebContents?: WebContents | undefined;
	titlebarWebContents: WebContents;
}

export interface Shortcut {
	accelerator: string;
	action: (context: ShortcutContext) => void;
}

export type Keymap = Record<string, Shortcut>;
