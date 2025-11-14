import { screen } from 'electron';

class WindowPositionService {
	#window = null;
	#store = null;

	constructor(window, store) {
		this.#window = window;
		this.#store = store;
	}

	restorePosition() {
		const savedBounds = this.#store.get('bounds');
		const isMaximized = this.#store.get('maximized', false);
	
		if (isMaximized) {
			this.#window.maximize();
		}
	
		if (savedBounds !== undefined) {
			const screenArea = screen.getDisplayMatching(savedBounds).workArea;
			if (
				(savedBounds.x > screenArea.x + screenArea.width || savedBounds.x < screenArea.x) ||
				(savedBounds.y < screenArea.y || savedBounds.y > screenArea.y + screenArea.height)
			) {
				this.#window.setBounds({
					x: (screenArea.width - screenArea.width * 0.8) / 2,
					y: (screenArea.height - screenArea.height * 0.8) / 2,
					width: screenArea.width * 0.8,
					height: screenArea.height * 0.8,
				});
			} else {
				this.#window.setBounds(this.#store.get('bounds'));
			}
		}
	}

	savePosition() {
		this.#store.set('bounds', this.#window.getBounds());
		this.#store.set('maximized', this.#window.isMaximized());
	}
}

export default WindowPositionService;