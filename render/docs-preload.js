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
	const isCalendarApp = document.location.hostname.startsWith('calendar');
	const isMailApp = document.location.hostname.startsWith('mail');

	const titleTarget = document.querySelector('title');
	const notionApp = document.getElementById('notion-app');
	let isSidebarUnfolded = true;

	// Watch for title changes
	if (titleTarget) {
		const titleObserver = new MutationObserver(() => {
			ipcRenderer.send('history-changed', document.title, null);
		});
		titleObserver.observe(titleTarget, {
			childList: true,
		});
	}

	// Watch for icon changes
	if (isCalendarApp) {
		const headObserver = new MutationObserver((mutations) => {
			let isSvgIcon = false;
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.tagName === 'LINK' && node.rel === 'icon' && node.href.endsWith('.svg')) {
						isSvgIcon = true;
						ipcRenderer.send('history-changed', null, node.href);
					}
				});
			});

			if (!isSvgIcon) {
				const node = document.querySelector('link[rel="icon"][href$=".svg"]');
				if (node) {
					ipcRenderer.send('history-changed', null, node.href);
				}
			}
		});
		headObserver.observe(document.head, {
			childList: true,
		});
	} else if (isMailApp) {
		const headObserver = new MutationObserver((mutations) => {
			const node = document.querySelector('link[rel="icon"][sizes="32x32"]');
			if (node) {
				ipcRenderer.send('history-changed', null, node.href);
			}
		});
		headObserver.observe(document.head, {
			childList: true,
		});
	} else {
		const icon = document.querySelector('link[rel="shortcut icon"]');
		if (icon) {
			const iconObserver = new MutationObserver(() => {
				ipcRenderer.send('history-changed', null, icon.href);
			});
			iconObserver.observe(icon, {
				attributes: true,
				attributeFilter: ['href'],
			});
		}
	}

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
		// Context menu handling
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
		ipcRenderer.send('history-changed', document.title, null);
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