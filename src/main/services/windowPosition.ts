import { screen, type BaseWindow, type Rectangle } from 'electron';
import { DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH } from '../../shared/constants';
import type { AppStore } from '../types';

class WindowPositionService {
	private store: AppStore;

	constructor(store: AppStore) {
		this.store = store;
	}

	public subscribeToPositionChange(win: BaseWindow) {
		const callback = () => {
			this.savePosition(win);
		};

		win.on('close', callback);
		win.on('maximize', callback);
		win.on('unmaximize', callback);
		win.on('move', callback);
		win.on('resize', callback);
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
			win.maximize();
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
		const isMaximized = win.isMaximized();
		this.store.set('maximized', isMaximized);
		if (!isMaximized) {
			this.store.set('bounds', win.getContentBounds());
		}
	}
}

export default WindowPositionService;
