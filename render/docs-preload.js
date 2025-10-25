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
	const notionApp = document.getElementById('notion-app');
	let isSidebarUnfolded = true;

	function observeDocumentMetaInfo(mutations) {
		mutations.forEach(() => {
			setTimeout(() => {
				ipcRenderer.send('history-changed', document.title, iconTarget?.href);
			}, 100);
		});
	}

	const titleObserver = new MutationObserver(observeDocumentMetaInfo);
	titleObserver.observe(titleTarget, {
		childList: true,
	});

	const iconObserver = new MutationObserver(observeDocumentMetaInfo);
	iconObserver.observe(iconTarget, {
		attributes: true,
		attributeFilter: ['href'],
	});

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

	if (notionApp) {
		document.addEventListener('contextmenu', (e) => {
			const link = e.target.closest('a');
			const image = e.target.closest('img');
			const input = e.target.closest('input, textarea, [contenteditable="true"]');
			const isLink = !!link;
			const isImage = !!image;
			const isInput = !!input;
			const isSelection = !!window.getSelection().toString();

			if (isLink && e.defaultPrevented) return;

			if (isLink || isImage || isInput || isSelection) {
				ipcRenderer.send('show-page-context-menu', {
					isLink,
					isImage,
					linkUrl: link?.href,
					imageUrl: image?.src,
					isSelection,
				});
			}
		}, { capture: false } );
	}

	ipcRenderer.send('request-options');

	window.addEventListener('popstate', () => {
		ipcRenderer.send('history-changed', document.title, iconTarget?.href);
	});
});

ipcRenderer.on('request-sidebar-data', () => {
	waitForElement('.notion-sidebar-container').then(sidebar => {
		const collapsed = sidebar.style.width === '0px';
		ipcRenderer.send('sidebar-changed', collapsed, sidebar.style.width);
	});
});

ipcRenderer.on('global-options', (event, options) => {
	if (options.sidebarContinueToTitlebar) {
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
	
			ipcRenderer.send('sidebar-changed', collapsed, sidebar.style.width);
		});
	
		waitForElement('.notion-sidebar-container').then(sidebar => {
			sidebarObserver.observe(sidebar, {
				attributes: true,
				attributeFilter: ['style'],
			});
	
			const collapsed = sidebar.style.width === '0px';

			ipcRenderer.send('sidebar-changed', collapsed, sidebar.style.width);

			addStyleTag(`.notion-topbar>div>div>div:first-child,.notion-open-sidebar,.notion-close-sidebar{display:none !important}`);
		});
	}
});