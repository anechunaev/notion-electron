import { screen } from 'electron';

class WindowPositionService {
	#store = null;
	#isMaximized = false;

	constructor(store) {
		this.#store = store;
		// win.isMaximized() is unreliable on Linux, so track maximized state from the
		// maximize/unmaximize events instead, seeded from the stored flag at startup.
		this.#isMaximized = store.get('maximized', false);
	}

	subscribeToPositionChange(win) {
		win.on('maximize', () => {
			this.#isMaximized = true;
			this.#store.set('maximized', true);
		});

		win.on('unmaximize', () => {
			this.#isMaximized = false;
			this.#store.set('maximized', false);
			this.savePosition(win);
		});

		win.on('close', () => this.savePosition(win));
		win.on('move', () => this.savePosition(win));
		win.on('resize', () => this.savePosition(win));
	}

	getPosition() {
		const savedBounds = this.#store.get('bounds');
		const isMaximized = this.#store.get('maximized', false);

		const bounds = { x: 0, y: 0, width: 600, height: 400 };

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

	restorePosition(win) {
		const savedBounds = this.#store.get('bounds');
		const isMaximized = this.#store.get('maximized', false);

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

	savePosition(win) {
		if (this.#isMaximized || this.#looksMaximized(win)) {
			return;
		}
		this.#store.set('bounds', win.getContentBounds());
	}

	#looksMaximized(win) {
		const { workArea } = screen.getDisplayMatching(win.getBounds());
		const bounds = win.getContentBounds();
		return bounds.width >= workArea.width && bounds.height >= workArea.height;
	}
}

export default WindowPositionService;
