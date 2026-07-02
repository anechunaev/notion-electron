import Sortable from 'sortablejs';
import type { TabInfo, TabsStatePayload } from '../../shared/ipc';
import { NOTION_NOTES_HOST } from '../../shared/constants';

document.addEventListener('DOMContentLoaded', () => {
	const tabMap: Record<string, HTMLElement> = {};
	let currentTabId: string | null = null;
	let currentApp = 'notes';
	let sidebarBaseWidth = 240;
	const zoomFactorMap: Record<string, number> = {};

	const addTabButton = document.querySelector<HTMLButtonElement>('.control[data-action="add"]');
	const historyBackButton = document.querySelector<HTMLButtonElement>('.control[data-action="history-back"]');
	const historyForwardButton = document.querySelector<HTMLButtonElement>('.control[data-action="history-forward"]');
	const titlebarSidebar = document.querySelector('.sidebar') as HTMLElement;
	const titlebar = document.querySelector('.titlebar') as HTMLElement;
	const sidebarCollapsed = document.querySelector<HTMLElement>('.sidebar-collapsed');
	const sidebarUnfold = document.querySelector<HTMLElement>('.sidebar-unfold');
	const tabgroup = document.querySelector('.tabgroup') as HTMLElement;
	const tabgroupShadowLeft = document.querySelector('.tabgroup-shadow-left') as HTMLElement;
	const tabgroupShadowRight = document.querySelector('.tabgroup-shadow-right') as HTMLElement;
	const tabgroupPinned = document.querySelector('.tabgroup-pinned') as HTMLElement;
	const allTabsButton = document.querySelector<HTMLButtonElement>('.tab-all .control');

	function getCurrentApp(): string {
		return currentApp;
	}

	function createTabElement(title: string, iconUrl?: string, documentUrl?: string, tabId?: string): HTMLElement {
		const template = document.getElementById('tab-template') as HTMLTemplateElement;
		const fragment = template.content.cloneNode(true) as DocumentFragment;
		const tab = fragment.querySelector('.tab') as HTMLElement;
		const tabTitle = tab.querySelector('.tab-title');
		if (tabTitle) tabTitle.textContent = title;
		const tabIcon = tab.querySelector<HTMLImageElement>('.tab-icon');
		if (tabIcon) tabIcon.src = iconUrl ?? '../icons/dark/document.svg';
		tab.dataset.tabId = tabId ?? crypto.randomUUID();
		tab.dataset.documentUrl = documentUrl ?? NOTION_NOTES_HOST;

		return tab;
	}

	function applyTabTitle(tab: HTMLElement, title: string): void {
		const tabTitle = tab.querySelector('.tab-title');
		if (tabTitle) tabTitle.textContent = title;
	}

	function applyTabIcon(tab: HTMLElement, icon: string): void {
		const tabIcon = tab.querySelector<HTMLImageElement>('.tab-icon');
		if (tabIcon) tabIcon.src = icon;
		const tabIconSource = tab.querySelector<HTMLSourceElement>('.tab-icon-source');
		if (tabIconSource) tabIconSource.srcset = icon;
	}

	function attachHandlers(tab: HTMLElement, tabId: string): void {
		tab.addEventListener('click', () => {
			window.notionElectronAPI.selectTab(tabId);
		});
		const closeButton = tab.querySelector('.tab-close');
		closeButton?.addEventListener('click', (e) => {
			e.stopPropagation();
			window.notionElectronAPI.closeTab(tabId);
		});
	}

	function scrollToSelectedTab(): void {
		const selected = titlebar.querySelector<HTMLElement>('.tab.selected');
		if (
			selected &&
			selected.closest('.tabgroup') &&
			(selected.offsetLeft < tabgroup.scrollLeft ||
				selected.offsetLeft + selected.clientWidth >= tabgroup.scrollLeft + tabgroup.clientWidth)
		) {
			const bb = selected.getBoundingClientRect();
			const tgbb = tabgroup.getBoundingClientRect();
			tabgroup.scrollTo({
				left: bb.left + tabgroup.scrollLeft - tgbb.left - (tgbb.width - bb.width) / 2,
				behavior: 'smooth',
			});
		}
	}

	function renderTabs(state: TabsStatePayload): void {
		const seen = new Set<string>();
		state.tabs.forEach((tab) => {
			seen.add(tab.id);
			let el = tabMap[tab.id];
			if (!el) {
				el = createTabElement(tab.title ?? 'New tab', tab.icon ?? undefined, tab.url, tab.id);
				tabMap[tab.id] = el;
				attachHandlers(el, tab.id);
			}
			if (tab.title) {
				el.title = tab.title;
				applyTabTitle(el, tab.title);
			}
			if (tab.icon) applyTabIcon(el, tab.icon);
			if (tab.url) el.dataset.documentUrl = tab.url;
			el.classList.toggle('selected', tab.id === state.currentTabId);
			(tab.pinned ? tabgroupPinned : tabgroup).appendChild(el);
			if (tab.id === state.currentTabId) currentApp = tab.app;
		});

		Object.keys(tabMap).forEach((id) => {
			if (!seen.has(id)) {
				tabMap[id]?.remove();
				delete tabMap[id];
			}
		});

		currentTabId = state.currentTabId;
		if (historyBackButton) historyBackButton.disabled = !state.canGoBack;
		if (historyForwardButton) historyForwardButton.disabled = !state.canGoForward;
		scrollToSelectedTab();
	}

	function onTabInfo(tabId: string, { title, icon, documentUrl, canGoBack, canGoForward }: TabInfo): void {
		const tab = tabMap[tabId];
		if (tab) {
			if (title) {
				tab.title = title;
				applyTabTitle(tab, title);
			}
			if (icon) applyTabIcon(tab, icon);
			if (documentUrl) tab.dataset.documentUrl = documentUrl;
		}

		if (tabId === currentTabId) {
			if (historyBackButton) historyBackButton.disabled = !tab || !canGoBack;
			if (historyForwardButton) historyForwardButton.disabled = !tab || !canGoForward;
		}
	}

	function onSidebarStateChange(collapsed: boolean, width: string, isZoomed = false): void {
		const widthNumber = parseInt(width.replace('calc(', ''), 10);
		if (!isZoomed) {
			sidebarBaseWidth = widthNumber;
		}
		const zoom = zoomFactorMap[getCurrentApp()] || 1;
		const w = width === '0px' ? '36px' : widthNumber * zoom + 'px';
		titlebarSidebar.classList.toggle('collapsed', collapsed);
		titlebarSidebar.style.width = w;
		titlebarSidebar.style.flex = `0 0 ${w}`;
	}

	function sendReorder(): void {
		const ids = (group: HTMLElement) =>
			Array.from(group.querySelectorAll<HTMLElement>('.tab'))
				.map((el) => el.dataset.tabId ?? '')
				.filter(Boolean);
		window.notionElectronAPI.reorderTabs(ids(tabgroupPinned), ids(tabgroup));
	}

	if (window.notionElectronAPI) {
		if (addTabButton) {
			addTabButton.addEventListener('click', () => window.notionElectronAPI.addTab({}));
		}

		if (historyBackButton) {
			historyBackButton.addEventListener('click', () => window.notionElectronAPI.historyBack());
		}

		if (historyForwardButton) {
			historyForwardButton.addEventListener('click', () => window.notionElectronAPI.historyForward());
		}

		if (tabgroup) {
			tabgroup.addEventListener('scroll', () => {
				if (tabgroup.scrollLeft <= 1) {
					tabgroupShadowLeft.classList.add('hidden');
				} else if (tabgroupShadowLeft.classList.contains('hidden')) {
					tabgroupShadowLeft.classList.remove('hidden');
				}
				if (tabgroup.scrollLeft >= tabgroup.scrollWidth - tabgroup.clientWidth - 1) {
					tabgroupShadowRight.classList.add('hidden');
				} else if (tabgroupShadowRight.classList.contains('hidden')) {
					tabgroupShadowRight.classList.remove('hidden');
				}
			});
			tabgroup.addEventListener('wheel', (e) => {
				if (e.deltaY !== 0 && e.deltaX === 0) {
					e.preventDefault();
					const maxScrollLeft = tabgroup.scrollWidth - tabgroup.clientWidth;
					const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, tabgroup.scrollLeft + e.deltaY));
					tabgroup.scrollLeft = targetScrollLeft;
				}
			});

			const tabgroupObserver = new MutationObserver(() => {
				tabgroupShadowLeft.classList.toggle('hidden', tabgroup.scrollLeft <= 1);
				tabgroupShadowRight.classList.toggle(
					'hidden',
					tabgroup.scrollLeft >= tabgroup.scrollWidth - tabgroup.clientWidth - 1,
				);
			});
			tabgroupObserver.observe(tabgroup, { childList: true });
		}

		if (allTabsButton) {
			allTabsButton.addEventListener('click', () => {
				window.notionElectronAPI.showAllTabsMenu();
			});
		}

		window.notionElectronAPI.requestGlobalOptions();

		window.notionElectronAPI.subscribeOnTabsState(renderTabs);
		window.notionElectronAPI.subscribeOnTabInfo(onTabInfo);
		window.notionElectronAPI.subscribeOnGlobalOptions((options) => {
			if (options.sidebarContinueToTitlebar) {
				titlebarSidebar.classList.remove('hidden');
				window.notionElectronAPI.subscribeOnSidebarChange(onSidebarStateChange);
				window.notionElectronAPI.requestSidebarData();

				if (sidebarCollapsed && sidebarUnfold) {
					let isCollapsingRequested = false;
					sidebarCollapsed.addEventListener('click', () => {
						window.notionElectronAPI.toggleSidebar();
					});

					sidebarUnfold.addEventListener('click', () => {
						window.notionElectronAPI.toggleSidebar();
					});

					sidebarCollapsed.addEventListener('pointerenter', () => {
						window.notionElectronAPI.foldSidebar(false);
					});

					sidebarCollapsed.addEventListener('pointerleave', () => {
						isCollapsingRequested = true;
						setTimeout(() => {
							if (isCollapsingRequested) {
								window.notionElectronAPI.foldSidebar(true);
								isCollapsingRequested = false;
							}
						}, 500);
					});

					window.notionElectronAPI.subscribeOnSidebarFoldingStop(() => {
						isCollapsingRequested = false;
					});
				}
			}
		});
		window.notionElectronAPI.subscribeOnZoomFactor((newZoomFactor) => {
			if (!titlebarSidebar.classList.contains('hidden')) {
				zoomFactorMap[getCurrentApp()] = newZoomFactor;
				onSidebarStateChange(titlebarSidebar.classList.contains('collapsed'), `${sidebarBaseWidth}px`, true);
			}
		});
		window.notionElectronAPI.subscribeOnAction((action) => {
			switch (action) {
				case 'tab-add':
					window.notionElectronAPI.addTab({});
					break;
				case 'tab-close':
					window.notionElectronAPI.closeCurrentTab();
					break;
				case 'tab-next':
					window.notionElectronAPI.nextTab();
					break;
				case 'tab-previous':
					window.notionElectronAPI.previousTab();
					break;
			}
		});
		window.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const tab = (e.target as HTMLElement | null)?.closest<HTMLElement>('.tab');
			if (tab) {
				const tabId = tab.dataset.tabId;
				if (tabId) window.notionElectronAPI.showContextMenu(tabId);
			}
		});

		window.notionElectronAPI.notifyReady();
	}

	Sortable.create(tabgroup, {
		group: 'tabs',
		animation: 100,
		direction: 'horizontal',
		setData: (dataTransfer, dragEl) => {
			dataTransfer.setData('text/uri-list', dragEl.dataset.documentUrl ?? NOTION_NOTES_HOST);
		},
		onEnd: sendReorder,
	});
	Sortable.create(tabgroupPinned, {
		group: 'tabs',
		animation: 100,
		direction: 'horizontal',
		setData: (dataTransfer, dragEl) => {
			dataTransfer.setData('text/uri-list', dragEl.dataset.documentUrl ?? NOTION_NOTES_HOST);
		},
		onEnd: sendReorder,
	});
});
