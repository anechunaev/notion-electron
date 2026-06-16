import { screen, type BaseWindow, type Rectangle } from 'electron';
import { DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH } from '../../shared/constants';
import type { AppStore } from '../types';

class WindowPositionService {
	private store: AppStore;
	private isMaximized: boolean;

	constructor(store: AppStore) {
		this.store = store;
		this.isMaximized = store.get('maximized', false);
	}

	public subscribeToPositionChange(win: BaseWindow) {
		win.on('maximize', () => {
			this.isMaximized = true;
			this.store.set('maximized', true);
		});

		win.on('unmaximize', () => {
			this.isMaximized = false;
			this.store.set('maximized', false);
			this.savePosition(win);
		});

		win.on('close', () => this.savePosition(win));
		win.on('move', () => this.savePosition(win));
		win.on('resize', () => this.savePosition(win));
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
