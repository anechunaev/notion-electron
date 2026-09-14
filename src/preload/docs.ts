import { ipcRenderer } from 'electron';

if (!navigator.onLine) {
	ipcRenderer.send('show-offline-screen', {
		isLocal: window.location.protocol === 'file:',
	});
}

interface ObservedMutation {
	target: HTMLElement;
}

type ObserverCallback = (mutations: ReadonlyArray<ObservedMutation>) => void;
type StyleReader<T> = (computedStyle: CSSStyleDeclaration, elementStyle: CSSStyleDeclaration) => T;

class SelectorObserver {
	#callback: ObserverCallback;
	#element: HTMLElement | null = null;
	#mutationObserver: MutationObserver | null = null;

	constructor(callback: ObserverCallback) {
		this.#callback = callback;
	}

	observe(selector: string, mutationObserverOptions?: MutationObserverInit): void {
		const el = document.querySelector<HTMLElement>(selector);
		if (this.#element !== el) {
			this.#element = el;
			if (this.#mutationObserver) {
				this.#mutationObserver.disconnect();
				this.#mutationObserver = null;
			}

			if (this.#element) {
				this.#callback([{ target: this.#element }]);
				this.#mutationObserver = new MutationObserver((mutations) => {
					this.#callback(mutations.map((mutation) => ({ target: mutation.target as HTMLElement })));
				});
				this.#mutationObserver.observe(this.#element, mutationObserverOptions);
			}
		}
		requestAnimationFrame(() => {
			this.observe(selector, mutationObserverOptions);
		});
	}

	disconnect(): void {
		if (this.#mutationObserver) {
			this.#mutationObserver.disconnect();
			this.#mutationObserver = null;
		}
	}
}

function waitForElement(selector: string): Promise<HTMLElement> {
	return new Promise((resolve) => {
		const existing = document.querySelector<HTMLElement>(selector);
		if (existing) {
			resolve(existing);
			return;
		}

		const observer = new MutationObserver(() => {
			const el = document.querySelector<HTMLElement>(selector);
			if (el) {
				observer.disconnect();
				resolve(el);
			}
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
	});
}

function addStyleTag(style: string): void {
	const tag = document.createElement('style');
	tag.innerText = style;
	document.head.appendChild(tag);
}

function getCurrentApp() {
	const isCalendarApp = document.location.hostname.startsWith('calendar');

	return {
		isCalendarApp,
		isNotesApp: !isCalendarApp,
		app: isCalendarApp ? 'calendar' : 'notes',
	};
}

interface ReportSidebarOptions {
	selector: string;
	useMutationObserver?: boolean;
	useSelectorObserver?: boolean;
	getReportedWidth?: StyleReader<string>;
	getCollapsedValue?: StyleReader<boolean>;
	addStyle?: string;
}

function reportSidebarWidth({
	selector,
	useMutationObserver = false,
	useSelectorObserver = false,
	getReportedWidth = () => '0px',
	getCollapsedValue = () => true,
	addStyle,
}: ReportSidebarOptions): void {
	let observer: MutationObserver | SelectorObserver | null = null;

	if (useMutationObserver) {
		observer = new MutationObserver(() => {
			const sidebar = document.querySelector<HTMLElement>(selector);
			if (!sidebar) return;
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

	waitForElement(selector).then((sidebar) => {
		if (observer instanceof SelectorObserver) {
			observer.observe(selector, {
				attributes: true,
				attributeFilter: ['style', 'class'],
			});
		} else if (observer) {
			observer.observe(sidebar, {
				attributes: true,
				attributeFilter: ['style', 'class'],
			});
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

document.addEventListener('DOMContentLoaded', function () {
	const { isCalendarApp } = getCurrentApp();

	// Sidebar event handling
	function sendSignalFoldingStop() {
		ipcRenderer.send('sidebar-folding-stop');
	}
	function sendSignalFold() {
		ipcRenderer.send('sidebar-fold', true);
	}
	if (isCalendarApp) {
		// Observe re-hydration
		const observer = new SelectorObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.target.style.transform) {
					const sidebar = mutation.target;
					observer.disconnect();
					if (sidebar) {
						sidebar.addEventListener('pointerenter', sendSignalFoldingStop);
						sidebar.addEventListener('pointerleave', sendSignalFold);
					}
				}
			});
		});
		observer.observe('#main>div:first-child>div:nth-child(2)>div', {
			attributes: true,
			attributeFilter: ['style'],
		});
	} else {
		waitForElement('.notion-sidebar')
			.then((sidebar) => {
				if (sidebar) {
					sidebar.addEventListener('pointerenter', sendSignalFoldingStop);
					sidebar.addEventListener('pointerleave', sendSignalFold);
				}
			})
			.catch(console.error);
	}

	ipcRenderer.send('request-options');
});

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible' && sidebarContinueToTitlebar) {
		const { isCalendarApp } = getCurrentApp();

		if (isCalendarApp) {
			reportSidebarWidth({
				selector: '#main>div:first-child>div:nth-child(2)>div',
				getCollapsedValue: (_, elementStyle) => elementStyle.transform !== 'none',
				getReportedWidth: (computedStyle) => `${parseInt(computedStyle.width, 10) + 1}px`,
			});
		}
	}
});

ipcRenderer.on('request-sidebar-data', () => {
	const { isCalendarApp } = getCurrentApp();

	if (isCalendarApp) {
		reportSidebarWidth({
			selector: '#main>div:first-child>div:nth-child(2)>div',
			getCollapsedValue: (_, elementStyle) => elementStyle.transform !== 'none',
			getReportedWidth: (computedStyle) => `${parseInt(computedStyle.width, 10) + 1}px`,
		});
	} else {
		reportSidebarWidth({
			selector: '.notion-sidebar-container',
			getCollapsedValue: (_, elementStyle) => elementStyle.width === '0px',
			getReportedWidth: (_, elementStyle) => elementStyle.width,
		});
	}
});

ipcRenderer.on('global-options', (event, options: { sidebarContinueToTitlebar: boolean }) => {
	sidebarContinueToTitlebar = options.sidebarContinueToTitlebar;

	if (options.sidebarContinueToTitlebar) {
		const { isCalendarApp } = getCurrentApp();

		if (isCalendarApp) {
			reportSidebarWidth({
				selector: '#main>div:first-child>div:nth-child(2)>div',
				getCollapsedValue: (_, elementStyle) => elementStyle.transform !== 'none',
				getReportedWidth: (computedStyle) => `${parseInt(computedStyle.width, 10) + 1}px`,
				useSelectorObserver: true,
			});
		} else {
			reportSidebarWidth({
				selector: '.notion-sidebar-container',
				getCollapsedValue: (_, elementStyle) => elementStyle.width === '0px',
				getReportedWidth: (_, elementStyle) => elementStyle.width,
				useMutationObserver: true,
			});
		}
	}
});

function foldCalendarSidebar(collapsed: boolean): void {
	const sidebar = document.querySelector<HTMLElement>('#main>div:first-child>div:nth-child(2)>div');
	if (!sidebar || sidebar.style.transform === 'none') return;
	sidebar.style.transform = collapsed ? 'translateX(calc(-100% - 40px))' : 'translateX(calc(0% - 0px))';
}

function foldNotesSidebar(collapsed: boolean): void {
	const sidebar = document.querySelector<HTMLElement>('.notion-sidebar');
	if (!sidebar || sidebar.style.height === '100%') return;

	const style: Record<string, string> = collapsed
		? { opacity: '0', transform: 'translateX(-220px) translateY(59px)' }
		: { opacity: '1', transform: 'translateX(0) translateY(59px)' };
	const styleDescrete: Record<string, string> = collapsed
		? { visibility: 'hidden', pointerEvents: 'none' }
		: { visibility: 'visible', pointerEvents: 'auto' };

	const styleMap = sidebar.style as unknown as Record<string, string>;
	const apply = (entries: Record<string, string>) => {
		Object.entries(entries).forEach(([key, value]) => {
			styleMap[key] = value;
		});
	};

	apply(style);
	if (collapsed) {
		setTimeout(() => apply(styleDescrete), 200);
	} else {
		apply(styleDescrete);
	}
}

ipcRenderer.on('sidebar-fold', (event, collapsed: boolean) => {
	const { isCalendarApp } = getCurrentApp();
	if (isCalendarApp) {
		foldCalendarSidebar(collapsed);
	} else {
		foldNotesSidebar(collapsed);
	}
});
