import type { BaseWindow, Rectangle, WebContentsView } from 'electron';
import { TITLEBAR_HEIGHT } from '../../shared/constants';

class TabLayout {
	private window: BaseWindow;
	private titleBarView: WebContentsView;

	constructor(window: BaseWindow, titleBarView: WebContentsView) {
		this.window = window;
		this.titleBarView = titleBarView;
	}

	public contentBounds(): Rectangle {
		const bounds = this.window.getContentBounds();
		return { x: 0, y: TITLEBAR_HEIGHT, width: bounds.width, height: bounds.height - TITLEBAR_HEIGHT };
	}

	public layout(tabViews: Iterable<WebContentsView>): void {
		const bounds = this.window.getContentBounds();
		this.titleBarView.setBounds({ x: 0, y: 0, width: bounds.width, height: TITLEBAR_HEIGHT });
		const content = this.contentBounds();
		for (const view of tabViews) {
			view.setBounds(content);
		}
	}
}

export default TabLayout;
