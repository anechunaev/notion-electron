import { screen, type BaseWindow, type Rectangle, type WebContentsView } from 'electron';
import { TITLEBAR_HEIGHT } from '../../shared/constants';
import type { AppStore } from '../types';

// On Linux, maximize/unmaximize is applied asynchronously by the window manager: `getContentBounds()`
// can keep reporting the pre-transition size for a while after the event fires, and how long varies
// by WM/compositor and system load. Rather than guessing a fixed wait, settling is debounced on the
// window's own 'resize' events: each one reschedules this timer, and the layout is corrected once
// resize events stop arriving (i.e. the transition has genuinely finished).
const SETTLE_DEBOUNCE_MS = 20; // A bit slower than 60Hz

class TabLayout {
	private window: BaseWindow;
	private titleBarView: WebContentsView;
	private isMaximized: boolean;
	private awaitingSettle: boolean;
	private settleTimer: NodeJS.Timeout | null = null;

	constructor(window: BaseWindow, titleBarView: WebContentsView, store: AppStore) {
		this.window = window;
		this.titleBarView = titleBarView;
		this.isMaximized = store.get('maximized', false);
		this.awaitingSettle = this.isMaximized;
	}

	public setMaximized(value: boolean): void {
		this.isMaximized = value;
		this.awaitingSettle = true;
	}

	public contentBounds(): Rectangle {
		const { width, height } = this.windowSize();
		return { x: 0, y: TITLEBAR_HEIGHT, width, height: height - TITLEBAR_HEIGHT };
	}

	public layout(tabViews: Iterable<WebContentsView>): void {
		const { width } = this.windowSize();
		this.titleBarView.setBounds({ x: 0, y: 0, width, height: TITLEBAR_HEIGHT });
		const content = this.contentBounds();
		for (const view of tabViews) {
			view.setBounds(content);
		}
	}

	public scheduleSettle(getTabViews: () => Iterable<WebContentsView>): void {
		if (this.settleTimer) {
			clearTimeout(this.settleTimer);
		}
		this.settleTimer = setTimeout(() => {
			this.settleTimer = null;
			this.awaitingSettle = false;
			this.layout(getTabViews());
		}, SETTLE_DEBOUNCE_MS);
	}

	public dispose(): void {
		if (this.settleTimer) {
			clearTimeout(this.settleTimer);
			this.settleTimer = null;
		}
	}

	private windowSize(): { width: number; height: number } {
		if (this.isMaximized && this.awaitingSettle) {
			const { workAreaSize } = screen.getDisplayMatching(this.window.getBounds());
			return { width: workAreaSize.width, height: workAreaSize.height };
		}
		const bounds = this.window.getContentBounds();
		return { width: bounds.width, height: bounds.height };
	}
}

export default TabLayout;
