import { screen, type BaseWindow, type Rectangle } from 'electron';
import { DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH } from '../../shared/constants';
import type { AppStore } from '../types';

// Linux window managers can emit several transitional 'resize' events mid maximize/unmaximize,
// before Electron's own 'maximize'/'unmaximize' event confirms the state change and before bounds
// reach their final value. Saving on every raw event risks persisting one of those transitional
// sizes as the window's real (non-maximized) bounds, which then poisons the next launch. Debouncing
// on trailing resize/move events ensures we only persist once bounds have actually settled.
const SAVE_DEBOUNCE_MS = 20; // A bit slower than 60Hz

class WindowPositionService {
	private store: AppStore;
	private isMaximized: boolean;
	private saveTimer: NodeJS.Timeout | null = null;

	constructor(store: AppStore) {
		this.store = store;
		this.isMaximized = store.get('maximized', false);
	}

	public subscribeToPositionChange(win: BaseWindow) {
		win.on('maximize', () => {
			this.isMaximized = true;
			this.store.set('maximized', true);
			this.cancelPendingSave();
		});

		win.on('unmaximize', () => {
			this.isMaximized = false;
			this.store.set('maximized', false);
			this.scheduleSave(win);
		});

		win.on('close', () => {
			this.cancelPendingSave();
			this.savePosition(win);
		});
		win.on('move', () => this.scheduleSave(win));
		win.on('resize', () => this.scheduleSave(win));
	}

	private scheduleSave(win: BaseWindow): void {
		this.cancelPendingSave();
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			this.savePosition(win);
		}, SAVE_DEBOUNCE_MS);
	}

	private cancelPendingSave(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
	}

	public getPosition() {
		const savedBounds = this.store.get('bounds');
		const isMaximized = this.store.get('maximized', false);

		const bounds: Rectangle = { x: 0, y: 0, width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT };

		if (savedBounds !== undefined) {
			const screenArea = screen.getDisplayMatching(savedBounds).workArea;
			if (
				savedBounds.x > screenArea.x + screenArea.width ||
				savedBounds.x < screenArea.x ||
				savedBounds.y < screenArea.y ||
				savedBounds.y > screenArea.y + screenArea.height
			) {
				bounds.x = (screenArea.width - screenArea.width * 0.8) / 2;
				bounds.y = (screenArea.height - screenArea.height * 0.8) / 2;
				bounds.width = screenArea.width * 0.8;
				bounds.height = screenArea.height * 0.8;
			} else {
				bounds.x = savedBounds.x;
				bounds.y = savedBounds.y;
				bounds.width = savedBounds.width;
				bounds.height = savedBounds.height;
			}
		}
		return { bounds, isMaximized };
	}

	public restorePosition(win: BaseWindow) {
		const savedBounds = this.store.get('bounds');
		const isMaximized = this.store.get('maximized', false);

		if (isMaximized) {
			if (win.isVisible()) {
				win.maximize();
			} else {
				// Window was started hidden (Show Window on Application Start = off).
				// Don't force it visible; maximize once the user actually shows it.
				win.once('show', () => win.maximize());
			}
			return;
		}

		if (savedBounds !== undefined) {
			const screenArea = screen.getDisplayMatching(savedBounds).workArea;
			if (
				savedBounds.x > screenArea.x + screenArea.width ||
				savedBounds.x < screenArea.x ||
				savedBounds.y < screenArea.y ||
				savedBounds.y > screenArea.y + screenArea.height
			) {
				win.setBounds({
					x: (screenArea.width - screenArea.width * 0.8) / 2,
					y: (screenArea.height - screenArea.height * 0.8) / 2,
					width: screenArea.width * 0.8,
					height: screenArea.height * 0.8,
				});
			} else {
				win.setBounds(savedBounds);
			}
		}
	}

	public savePosition(win: BaseWindow) {
		if (this.isMaximized || this.looksMaximized(win)) {
			return;
		}
		this.store.set('bounds', win.getContentBounds());
	}

	private looksMaximized(win: BaseWindow): boolean {
		const { workArea } = screen.getDisplayMatching(win.getBounds());
		const bounds = win.getContentBounds();
		return bounds.width >= workArea.width && bounds.height >= workArea.height;
	}
}

export default WindowPositionService;
