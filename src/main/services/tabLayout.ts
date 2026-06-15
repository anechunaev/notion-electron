import { screen, type BaseWindow, type Rectangle, type WebContentsView } from 'electron';
import { TITLEBAR_HEIGHT } from '../../shared/constants';
import type { AppStore } from '../types';

class TabLayout {
	private window: BaseWindow;
	private titleBarView: WebContentsView;
	private isMaximized: boolean;

	constructor(window: BaseWindow, titleBarView: WebContentsView, store: AppStore) {
		this.window = window;
		this.titleBarView = titleBarView;
		this.isMaximized = store.get('maximized', false);
	}

	public setMaximized(value: boolean): void {
		this.isMaximized = value;
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

	private windowSize(): { width: number; height: number } {
		if (this.isMaximized) {
			const { workAreaSize } = screen.getDisplayMatching(this.window.getBounds());
			return { width: workAreaSize.width, height: workAreaSize.height };
		}
		const bounds = this.window.getContentBounds();
		return { width: bounds.width, height: bounds.height };
	}
}

export default TabLayout;
