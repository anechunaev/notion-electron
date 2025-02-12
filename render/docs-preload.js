const { ipcRenderer } = require('electron/renderer');

function waitForElement(selector) {
	return new Promise(resolve => {
		if (document.querySelector(selector)) {
			return resolve(document.querySelector(selector));
		}

		const observer = new MutationObserver(mutations => {
			if (document.querySelector(selector)) {
				observer.disconnect();
				resolve(document.querySelector(selector));
			}
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
	});
}

function addStyleTag(style) {
	const tag = document.createElement("style");
	tag.innerText = style;
	document.head.appendChild(tag);
}

document.addEventListener('DOMContentLoaded', function() {
	const titleTarget = document.querySelector('title');
	const iconTarget = document.querySelector('link[rel="shortcut icon"]');
	let isSidebarUnfolded = true;

	const titleObserver = new MutationObserver(function(mutations) {
		mutations.forEach(function(mutation) {
			setTimeout(() => {
				ipcRenderer.send('history-changed', document.title, iconTarget?.href);
			}, 200);
		});
	});
	titleObserver.observe(titleTarget, {
		childList: true,
	});

	const sidebarObserver = new MutationObserver(function(mutations) {
		const sidebar = document.querySelector('.notion-sidebar-container');
		const collapsed = sidebar.style.width === '0px';
		isSidebarUnfolded = !collapsed;

		if (!collapsed) {
			const sidePanel = document.querySelector('.notion-sidebar');
			const style = {
				opacity: '1',
				transform: 'translateX(0) translateY(0)',
				visibility: 'visible',
				pointerEvents: 'auto',
				height: '100%',
			};
			Object.entries(style).forEach(([key, value]) => {
				sidePanel.style[key] = value;
			});
		}

		ipcRenderer.send('sidebar-changed', collapsed);
	});

	waitForElement('.notion-sidebar-container').then(sidebar => {
		sidebarObserver.observe(sidebar, {
			attributes: true,
			attributeFilter: ['style'],
		});

		const collapsed = sidebar.style.width === '0px';
		isSidebarUnfolded = !collapsed;

		ipcRenderer.send('sidebar-changed', collapsed);
	});

	addStyleTag(`.notion-topbar>div>div>div:first-child,.notion-open-sidebar,.notion-close-sidebar{display:none !important}`);

	ipcRenderer.on('sidebar-fold', (event, collapsed) => {
		if (isSidebarUnfolded) return;

		const sidebar = document.querySelector('.notion-sidebar');
		const style = collapsed ? {
			opacity: '0',
			transform: 'translateX(-220px) translateY(59px)',
		} : {
			opacity: '1',
			transform: 'translateX(0) translateY(59px)',
		};
		const styleDescrete = collapsed ? {
			visibility: 'hidden',
			pointerEvents: 'none',
		} : {
			visibility: 'visible',
			pointerEvents: 'auto',
		};

		Object.entries(style).forEach(([key, value]) => {
			sidebar.style[key] = value;
		});

		if (collapsed) {
			setTimeout(() => {
				Object.entries(styleDescrete).forEach(([key, value]) => {
					sidebar.style[key] = value;
				});
			}, 200);
		} else {
			Object.entries(styleDescrete).forEach(([key, value]) => {
				sidebar.style[key] = value;
			});
		}
	});
});