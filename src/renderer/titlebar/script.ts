import Sortable from 'sortablejs';
import { APP_NAMES, getAppFromUrl } from '../../shared/apps';
import type { TabInfo, TabRequest } from '../../shared/ipc';

document.addEventListener('DOMContentLoaded', () => {
	const tabMap: Record<string, HTMLElement> = {};
	const tabMapDisconnect: Record<string, (e: Event) => void> = {};
	const tabMapSelect: Record<string, () => void> = {};
	const tabStack: string[] = [];
	const tabAppMap: Record<string, Set<string>> = Object.fromEntries(
		APP_NAMES.map((app): [string, Set<string>] => [app, new Set<string>()]),
	);
	let initialTabId: string | null = null;
	let currentTabId: string | null = null;
	let sidebarBaseWidth = 240;
	const zoomFactorMap: Record<string, number> = Object.fromEntries(
		APP_NAMES.map((app): [string, number] => [app, 1]),
	);

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
		for (const [app, tabIds] of Object.entries(tabAppMap)) {
			if (currentTabId && tabIds.has(currentTabId)) {
				return app;
			}
		}
		return 'notes';
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
		tab.dataset.documentUrl = documentUrl ?? 'https://www.notion.so';

		return tab;
	}

	function findReusableTabId(app: string): string | undefined {
		const appSet = tabAppMap[app];
		return appSet ? Array.from(appSet).find((id) => tabMap[id]) : undefined;
	}

	function attachCloseHandler(tab: HTMLElement, tabId: string): void {
		const closeButton = tab.querySelector('.tab-close');
		if (!closeButton) return;
		tabMapDisconnect[tabId] = (e: Event) => {
			e.stopPropagation();
			onCloseTab(tabId);
		};
		closeButton.addEventListener('click', tabMapDisconnect[tabId]);
	}

	function placeTab(tab: HTMLElement, isPinned: boolean): void {
		if (isPinned) {
			tabgroupPinned.appendChild(tab);
			return;
		}
		tabgroup.appendChild(tab);
		setTimeout(() => {
			const boundingBox = tab.getBoundingClientRect();
			tabgroup.scrollLeft = boundingBox.left + boundingBox.width - tabgroup.clientWidth;
		}, 0);
	}

	function registerTab(
		tab: HTMLElement,
		tabId: string,
		url: string | undefined,
		app: string | undefined,
		isPinned: boolean,
	): void {
		tabMap[tabId] = tab;
		tabMapSelect[tabId] = () => onSelectTab(tabId);
		tabStack.push(tabId);
		tabAppMap[app ?? getAppFromUrl(url ?? 'https://www.notion.so')]?.add(tabId);
		tab.addEventListener('click', tabMapSelect[tabId]);
		attachCloseHandler(tab, tabId);
		placeTab(tab, isPinned);
	}

	function onSelectTab(tabId: string | undefined, skipChange = false): void {
		Object.values(tabMap).forEach((tab) => {
			const selected = tab.dataset.tabId === tabId;
			if (skipChange) {
				tab.classList.toggle('selected', tab.dataset.tabId === initialTabId);
			} else {
				tab.classList.toggle('selected', selected);

				if (selected && tabId) {
					window.notionElectronAPI.changeTab(tabId);
					currentTabId = tabId;
				}
			}
		});
		scrollToSelectedTab();
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

	function onAddTab({ url, tabId: tabIdRequested, isPinned = false, app, skipChange = false }: TabRequest): void {
		if (tabIdRequested && tabMap[tabIdRequested]) {
			onSelectTab(tabIdRequested);
			return;
		}

		const reusableId = !tabIdRequested && app ? findReusableTabId(app) : undefined;
		if (reusableId) {
			onSelectTab(reusableId, skipChange);
			return;
		}

		const tab = createTabElement('New tab', undefined, url, tabIdRequested);
		const tabId = tab.dataset.tabId;
		if (!tabId) return;

		registerTab(tab, tabId, url, app, isPinned);

		window.notionElectronAPI.addTab({ tabId, url, isPinned, app }).then(() => {
			onSelectTab(tabId, skipChange);
		});
	}

	function onHistoryBack(): void {
		window.notionElectronAPI.historyBack();
	}

	function onHistoryForward(): void {
		window.notionElectronAPI.historyForward();
	}

	function onCloseTab(tabId: string): void {
		if (Object.values(tabMap).length === 1) {
			window.notionElectronAPI.setUrl(tabId, '/login');
			return;
		}

		window.notionElectronAPI.closeTab(tabId).then(() => {
			const tab = tabMap[tabId];

			if (!tab) return;

			const closeButton = tab.querySelector('.tab-close');
			const disconnect = tabMapDisconnect[tabId];

			if (closeButton && disconnect) {
				closeButton.removeEventListener('click', disconnect);
			}

			const select = tabMapSelect[tabId];
			if (select) tab.removeEventListener('click', select);

			const currentIndex = tabStack.indexOf(tabId);
			const nextIndex = currentIndex - 1 < 0 ? 0 : currentIndex - 1;

			tabStack.splice(currentIndex, 1);

			onSelectTab(tabStack[nextIndex]);

			tab.remove();
			delete tabMap[tabId];
			delete tabMapDisconnect[tabId];
			delete tabMapSelect[tabId];
		});
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

		if (historyBackButton) historyBackButton.disabled = !tab || !canGoBack;
		if (historyForwardButton) historyForwardButton.disabled = !tab || !canGoForward;
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

	if (window.notionElectronAPI) {
		if (addTabButton) {
			addTabButton.addEventListener('click', () => onAddTab({ url: 'https://www.notion.so' }));
		}

		if (historyBackButton) {
			historyBackButton.addEventListener('click', onHistoryBack);
		}

		if (historyForwardButton) {
			historyForwardButton.addEventListener('click', onHistoryForward);
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

		window.notionElectronAPI.subscribeOnTabInfo(onTabInfo);
		window.notionElectronAPI.subscribeOnTabRequest(onAddTab);
		window.notionElectronAPI.subscribeOnContextMenu((command) => {
			switch (command.id) {
				case 'pin': {
					const tab = command.tabId ? tabMap[command.tabId] : undefined;
					if (tab) {
						const isPinned = tab.parentElement === tabgroupPinned;
						if (isPinned) {
							tabgroup.appendChild(tab);
						} else {
							tabgroupPinned.appendChild(tab);
						}
					}
					break;
				}
				case 'close':
					if (command.tabId) onCloseTab(command.tabId);
					break;
				case 'closeAll': {
					const tabIds = Object.keys(tabMap);
					if (tabIds.length === 1 && tabIds[0]) {
						onCloseTab(tabIds[0]);
					} else {
						Object.entries(tabMap).forEach(([id, tab]) => {
							if (tab.parentElement !== tabgroupPinned) {
								onCloseTab(id);
							}
						});
						if (Object.keys(tabMap).length === 0) {
							onAddTab({ url: 'https://www.notion.so' });
						}
					}
					break;
				}
				case 'closeOther':
					command.tabIds?.forEach(onCloseTab);
					break;
			}
		});
		window.notionElectronAPI.subscribeOnGlobalOptions((options) => {
			if (options.initialTabId) {
				initialTabId = options.initialTabId;
			}

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
			const currentIndex = currentTabId ? tabStack.indexOf(currentTabId) : -1;
			switch (action) {
				case 'tab-add':
					onAddTab({ url: 'https://www.notion.so' });
					break;
				case 'tab-close':
					if (currentTabId) {
						onCloseTab(currentTabId);
					}
					break;
				case 'tab-next': {
					const nextIndex = currentIndex + 1 >= tabStack.length ? 0 : currentIndex + 1;
					onSelectTab(tabStack[nextIndex]);
					break;
				}
				case 'tab-previous': {
					const prevIndex = currentIndex - 1 < 0 ? tabStack.length - 1 : currentIndex - 1;
					onSelectTab(tabStack[prevIndex]);
					break;
				}
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
			dataTransfer.setData('text/uri-list', dragEl.dataset.documentUrl ?? 'https://www.notion.so');
		},
		onEnd: ({ to, item }) => {
			const isPinned = to === tabgroupPinned;
			window.notionElectronAPI.togglePinTab(item.dataset.tabId ?? '', isPinned);
		},
	});
	Sortable.create(tabgroupPinned, {
		group: 'tabs',
		animation: 100,
		direction: 'horizontal',
		setData: (dataTransfer, dragEl) => {
			dataTransfer.setData('text/uri-list', dragEl.dataset.documentUrl ?? 'https://www.notion.so');
		},
		onEnd: ({ to, item }) => {
			const isPinned = to === tabgroupPinned;
			window.notionElectronAPI.togglePinTab(item.dataset.tabId ?? '', isPinned);
		},
	});
});
