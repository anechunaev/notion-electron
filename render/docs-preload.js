const { ipcRenderer } = require('electron/renderer');

class SelectorObserver {
	#callback = () => {};
	#element = null;
	#mutationObserver = null;

	constructor(callback) {
		this.#callback = callback;
	}

	observe(selector, mutationObserverOptions) {
		const el = document.querySelector(selector);
		if (this.#element !== el) {
			this.#element = el;
			if (this.#mutationObserver) {
				this.#mutationObserver.disconnect();
				this.#mutationObserver = null;
			}

			if (this.#element) {
				this.#callback([{ type: 'init', target: this.#element }]);
				this.#mutationObserver = new MutationObserver((mutations) => {
					this.#callback(mutations);
				});
				this.#mutationObserver.observe(this.#element, mutationObserverOptions);
			}
		}
		requestAnimationFrame(() => {
			this.observe(selector, mutationObserverOptions);
		});
	}

	disconnect() {
		if (this.#mutationObserver) {
			this.#mutationObserver.disconnect();
			this.#mutationObserver = null;
		}

		if (this.#element) {
			this.#element = null;
		}

		this.#callback = null;
	}
}

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

function getCurrentApp() {
	const isCalendarApp = document.location.hostname.startsWith('calendar');
	const isMailApp = document.location.hostname.startsWith('mail');

	return {
		isCalendarApp,
		isMailApp,
		isNotesApp: !isCalendarApp && !isMailApp,
		app: isCalendarApp ? 'calendar' : isMailApp ? 'mail' : 'notes',
	}
}

function reportSidebarWidth({
	selector,
	useMutationObserver = false,
	useSelectorObserver = false,
	getReportedWidth = () => '0px',
	getCollapsedValue = () => true,
	addStyle,
}) {
	let observer = null;

	if (useMutationObserver) {
		observer = new MutationObserver(() => {
			const sidebar = document.querySelector(selector);
			const computedStyle = window.getComputedStyle(sidebar);
			const collapsed = getCollapsedValue(computedStyle, sidebar.style);
			const reportedWidth = collapsed ? '0px' : getReportedWidth(computedStyle, sidebar.style);

			if (!document.hidden) {
				ipcRenderer.send('sidebar-changed', collapsed, reportedWidth);
			}
		});
	}

	if (useSelectorObserver) {
		observer = new SelectorObserver((mutations) => {
			mutations.forEach((mutation) => {
				const sidebar = mutation.target;
				const computedStyle = window.getComputedStyle(sidebar);
				const collapsed = getCollapsedValue(computedStyle, sidebar.style);
				const reportedWidth = collapsed ? '0px' : getReportedWidth(computedStyle, sidebar.style);

				if (!document.hidden) {
					ipcRenderer.send('sidebar-changed', collapsed, reportedWidth);
				}
			});
		});
	}

	waitForElement(selector).then(sidebar => {
		if (observer) {
			observer.observe(
				useSelectorObserver ? selector : sidebar,
				{
					attributes: true,
					attributeFilter: ['style', 'class'],
				}
			);
		}

		const computedStyle = window.getComputedStyle(sidebar);
		const collapsed = getCollapsedValue(computedStyle, sidebar.style);
		const reportedWidth = collapsed ? '0px' : getReportedWidth(computedStyle, sidebar.style);

		if (!document.hidden) {
			ipcRenderer.send('sidebar-changed', collapsed, reportedWidth);
		}

		if (addStyle) {
			addStyleTag(addStyle);
		}
	});
}

let sidebarContinueToTitlebar = false;

document.addEventListener('DOMContentLoaded', function() {
	const { isCalendarApp, isMailApp } = getCurrentApp();

	const titleTarget = document.querySelector('title');
	const notionApp = document.getElementById('notion-app');

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

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible' && sidebarContinueToTitlebar) {
		const { isCalendarApp, isMailApp } = getCurrentApp();

		if (isCalendarApp) {
			reportSidebarWidth({
				selector: '#main>div>div:nth-child(3)>div',
				getCollapsedValue: (computedStyle) => computedStyle.position === 'absolute',
				getReportedWidth: (computedStyle) => `calc(${computedStyle.width} + 1px)`,
			});
		} else if (isMailApp) {
			reportSidebarWidth({
				selector: '.app>div>div>div:first-child',
				getCollapsedValue: (computedStyle) => computedStyle.position === 'absolute',
				getReportedWidth: (computedStyle) => computedStyle.width,
			});
		}
	}
});

ipcRenderer.on('request-sidebar-data', () => {
	const { isCalendarApp, isMailApp } = getCurrentApp();

	if (isCalendarApp) {
		reportSidebarWidth({
			selector: '#main>div>div:nth-child(3)>div',
			getCollapsedValue: (computedStyle) => computedStyle.position === 'absolute',
			getReportedWidth: (computedStyle) => `calc(${computedStyle.width} + 1px)`,
		});
	} else if (isMailApp) {
		reportSidebarWidth({
			selector: '.app>div>div>div:first-child',
			getCollapsedValue: (computedStyle) => computedStyle.position === 'absolute',
			getReportedWidth: (computedStyle) => computedStyle.width,
		});
	} else {
		reportSidebarWidth({
			selector: '.notion-sidebar-container',
			getCollapsedValue: (_, elementStyle) => elementStyle.width === '0px',
			getReportedWidth: (_, elementStyle) => elementStyle.width,
		});
	}
});

ipcRenderer.on('global-options', (event, options) => {
	sidebarContinueToTitlebar = options.sidebarContinueToTitlebar;

	if (options.sidebarContinueToTitlebar) {
		const { isCalendarApp, isMailApp } = getCurrentApp();

		if (isCalendarApp) {
			reportSidebarWidth({
				selector: '#main>div>div:nth-child(3)>div',
				getCollapsedValue: (computedStyle) => computedStyle.position === 'absolute',
				getReportedWidth: (computedStyle) => `calc(${computedStyle.width} + 1px)`,
				useSelectorObserver: true,
			});
		} else if (isMailApp) {
			reportSidebarWidth({
				selector: '.app>div>div>div:first-child',
				getCollapsedValue: (computedStyle) => computedStyle.position === 'absolute',
				getReportedWidth: (computedStyle) => computedStyle.width,
				useSelectorObserver: true,
				addStyle: `.app>div>div>div:first-child>div:first-child{display:none !important}.app>div>div>div:first-child>div:last-child{padding-top:0 !important;display:block !important}`,
			});
		} else {
			reportSidebarWidth({
				selector: '.notion-sidebar-container',
				getCollapsedValue: (_, elementStyle) => elementStyle.width === '0px',
				getReportedWidth: (_, elementStyle) => elementStyle.width,
				useMutationObserver: true,
				addStyle: `.notion-topbar>div>div>div:first-child,.notion-open-sidebar,.notion-close-sidebar{display:none !important}`,
			});
		}
	}
});
