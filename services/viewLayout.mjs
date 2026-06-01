export const TITLEBAR_HEIGHT = 40;

export function getTabViewLayout({ width, height }, titlebarHeight = TITLEBAR_HEIGHT) {
	const layoutWidth = Math.max(0, Math.round(width ?? 0));
	const layoutHeight = Math.max(0, Math.round(height ?? 0));
	const toolbarHeight = Math.min(titlebarHeight, layoutHeight);

	return {
		titlebar: {
			x: 0,
			y: 0,
			width: layoutWidth,
			height: toolbarHeight,
		},
		page: {
			x: 0,
			y: toolbarHeight,
			width: layoutWidth,
			height: Math.max(0, layoutHeight - toolbarHeight),
		},
	};
}
