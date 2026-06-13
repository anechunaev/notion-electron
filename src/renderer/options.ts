import type { OptionsPayload, RendererOptionDefinition } from '../shared/ipc';

interface OptionGroup {
	id: string;
	name?: string;
	el: DocumentFragment;
	grid: Element | null;
}

type RenderableOption = { id: string } & RendererOptionDefinition;
type OptionTemplates = { checkbox: HTMLTemplateElement; select: HTMLTemplateElement; group: HTMLTemplateElement };

function populateSelect(select: HTMLSelectElement, options: Record<string, string>): void {
	Object.entries(options).forEach(([optionValue, optionName]) => {
		const optionEl = document.createElement('option');
		optionEl.value = optionValue;
		optionEl.textContent = optionName;
		select.appendChild(optionEl);
	});
}

// Build a single option row (label + input) from the matching template.
function buildOptionClone(option: RenderableOption, templates: OptionTemplates): DocumentFragment | null {
	const template = templates[option.value.type as keyof OptionTemplates];
	if (!template) return null;
	const clone = document.importNode(template.content, true);
	const label = clone.querySelector('label');
	const input = clone.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
	if (!label || !input) return null;
	label.textContent = option.name;
	label.htmlFor = option.id;
	input.id = option.id;
	input.name = option.id;
	if (option.value.type === 'select' && input instanceof HTMLSelectElement) {
		populateSelect(input, option.value.options ?? {});
		input.value = String(option.value.data ?? option.value.default);
	}
	if (option.value.type === 'checkbox' && input instanceof HTMLInputElement) {
		input.checked = Boolean(option.value.data);
	}
	input.addEventListener('change', (e) => {
		if (option.value.type === 'checkbox') {
			window.notionElectronAPI.setOption(option.id, (e.currentTarget as HTMLInputElement).checked);
		} else {
			window.notionElectronAPI.setOption(option.id, (e.target as HTMLSelectElement).value);
		}
	});
	return clone;
}

document.addEventListener('DOMContentLoaded', () => {
	let currentTab: string | null = null;
	let changelog: string | null = null;

	const cancel = document.getElementById('cancel') as HTMLElement;
	const restart = document.getElementById('restart') as HTMLElement;
	const tabs = Array.from(document.querySelectorAll<HTMLElement>('.tab'));
	const tabPanels = Array.from(document.querySelectorAll<HTMLElement>('.tab-panel'));
	const templates = {
		checkbox: document.getElementById('option-checkbox') as HTMLTemplateElement,
		select: document.getElementById('option-select') as HTMLTemplateElement,
		group: document.getElementById('option-group') as HTMLTemplateElement,
	};
	const stageLatest = document.querySelector('.stage-latest') as HTMLElement;
	const stageChecking = document.querySelector('.stage-checking') as HTMLElement;
	const stageAvailable = document.querySelector('.stage-available') as HTMLElement;
	const stageDownloading = document.querySelector('.stage-downloading') as HTMLElement;
	const stageReady = document.querySelector('.stage-ready') as HTMLElement;
	const stageInstalling = document.querySelector('.stage-installing') as HTMLElement;
	const stageInstalled = document.querySelector('.stage-installed') as HTMLElement;
	const stageError = document.querySelector('.stage-error') as HTMLElement;
	const statusDate = document.getElementById('status-date') as HTMLElement;
	const statusAvailable = document.getElementById('status-available') as HTMLElement;
	const statusLocal = document.getElementById('status-local') as HTMLElement;
	const updateManually = document.getElementById('update-manually') as HTMLButtonElement;
	const updateDownload = document.getElementById('update-download') as HTMLButtonElement;
	const updateProgress = document.getElementById('update-progress') as HTMLProgressElement;
	const updatePercentage = document.getElementById('update-percent') as HTMLElement;
	const updateDownloaded = document.getElementById('update-downloaded') as HTMLElement;
	const updateTotal = document.getElementById('update-total') as HTMLElement;
	const updateSpeed = document.getElementById('update-speed') as HTMLElement;
	const updateInstall = document.getElementById('update-install') as HTMLButtonElement;
	const updateError = document.getElementById('update-error') as HTMLElement;
	const updateStages = [
		stageLatest,
		stageChecking,
		stageAvailable,
		stageDownloading,
		stageReady,
		stageInstalling,
		stageInstalled,
		stageError,
	];
	const changelogElement = document.getElementById('changelog');

	function selectTab(tabId: string): void {
		if (tabId === currentTab) return;
		currentTab = tabId;

		tabs.forEach((t) => {
			t.classList.toggle('selected', t.id === currentTab);
		});
		tabPanels.forEach((panel) => {
			panel.classList.toggle('hidden', panel.dataset.for !== currentTab);
		});

		if (tabId === 'updates' && !changelog) {
			window.notionElectronAPI.requestChangelog();
		}
	}

	function toggleIndicator(tabId: string, value?: boolean): void {
		const tab = tabs.find((t) => t.id === tabId);
		if (!tab) return;
		const indicator = tab.querySelector('.indicator');
		if (!indicator) return;
		const visible = typeof value === 'undefined' ? !indicator.classList.contains('hidden') : value;
		indicator.classList.toggle('hidden', !visible);
	}

	tabs.forEach((tab) => {
		tab.addEventListener('click', () => {
			selectTab(tab.id);
		});
	});

	const hash = window.location.hash.slice(1);
	const firstTab = tabs[0];
	if (hash) {
		selectTab(hash);
	} else if (firstTab) {
		window.location.hash = firstTab.id;
		selectTab(firstTab.id);
	}

	window.notionElectronAPI.getAppMetadata();
	window.notionElectronAPI.getOptions();
	window.notionElectronAPI.requestUpdateStatus();

	window.notionElectronAPI.subscribeOnOptions((config: OptionsPayload) => {
		const optionsPanel = document.querySelector('.tab-panel.options') as HTMLElement;
		optionsPanel.innerHTML = '';
		const options = Object.entries(config.options).map(([id, option]) => {
			return {
				id,
				...option,
			};
		});
		const groups = Object.entries(config.groups).reduce<Record<string, OptionGroup>>((acc, [id, groupName]) => {
			const el = document.importNode(templates.group.content, true);
			const heading = el.querySelector('h1');
			if (heading) heading.textContent = groupName;
			acc[id] = {
				id,
				name: groupName,
				el,
				grid: el.querySelector('.grid'),
			};
			return acc;
		}, {});
		const nogroupEl = document.importNode(templates.group.content, true);
		const nogroupHeading = nogroupEl.querySelector('h1');
		if (nogroupHeading) nogroupHeading.textContent = 'Other Options';
		groups.nogroup = {
			id: 'nogroup',
			el: nogroupEl,
			grid: nogroupEl.querySelector('.grid'),
		};

		options.forEach((option) => {
			const clone = buildOptionClone(option, templates);
			if (clone) groups[option.group ?? 'nogroup']?.grid?.appendChild(clone);
		});
		optionsPanel.append(...Object.values(groups).map((group) => group.el));

		const autoUpdateCheckbox = document.getElementById('disable-update-functionality') as HTMLInputElement | null;
		const autoUpdateDepIds = [
			'update-check-interval',
			'update-auto-download',
			'update-auto-install',
			'update-notification',
		];

		function setUpdateOptionsDisabled(disabled: boolean): void {
			for (const id of autoUpdateDepIds) {
				const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
				if (!el) continue;
				el.closest('.grid-row')?.classList.toggle('disabled', disabled);
				el.disabled = disabled;
			}
			for (const btn of [updateManually, updateDownload, updateInstall]) {
				if (!btn) continue;
				btn.disabled = disabled;
			}
			if (updateManually) {
				updateManually.title = disabled ? 'Update functionality is disabled, see Options' : '';
			}
		}

		if (autoUpdateCheckbox) {
			setUpdateOptionsDisabled(autoUpdateCheckbox.checked);
			autoUpdateCheckbox.addEventListener('change', (e) => {
				setUpdateOptionsDisabled((e.currentTarget as HTMLInputElement).checked);
			});
		}
	});
	window.notionElectronAPI.subscribeOnTabChange((tabId) => {
		window.location.hash = tabId;
		selectTab(tabId);
	});
	window.notionElectronAPI.subscribeOnAppMetadata((metadata) => {
		const set = (id: string, value: string) => {
			const el = document.getElementById(id);
			if (el) el.textContent = value;
		};
		set('version', metadata.version);
		set('description', metadata.description);
		set('author', metadata.author);
		set('license', metadata.license);
	});
	window.notionElectronAPI.subscribeOnUpdateStatusChange((data) => {
		const {
			stage,
			percentage,
			downloaded,
			total,
			speed,
			error,
			lastCheckedFormatted,
			availableVersion,
			localVersion,
		} = data;
		updateStages.forEach((s) => {
			s.classList.add('hidden');
		});
		toggleIndicator('updates', false);
		switch (stage) {
			case 'latest':
				stageLatest.classList.remove('hidden');
				break;
			case 'checking':
				stageChecking.classList.remove('hidden');
				break;
			case 'available':
				toggleIndicator('updates', true);
				stageAvailable.classList.remove('hidden');
				break;
			case 'downloading':
				stageDownloading.classList.remove('hidden');
				updatePercentage.textContent = `${percentage}%`;
				updateProgress.value = percentage;
				updateDownloaded.textContent = downloaded;
				updateTotal.textContent = total;
				updateSpeed.textContent = speed;
				break;
			case 'ready':
				stageReady.classList.remove('hidden');
				break;
			case 'installing':
				stageInstalling.classList.remove('hidden');
				break;
			case 'installed':
				stageInstalled.classList.remove('hidden');
				break;
			case 'error':
				stageError.classList.remove('hidden');
				updateError.textContent = error ? String(error) : '';
				break;
		}
		statusDate.textContent = lastCheckedFormatted;
		statusAvailable.textContent = availableVersion;
		statusLocal.textContent = localVersion;
	});
	window.notionElectronAPI.subscribeOnUpdateChangelog((html) => {
		changelog = html;

		if (changelogElement) {
			changelogElement.innerHTML = changelog;
		}
	});

	restart.addEventListener('click', () => {
		window.notionElectronAPI.restartApp();
	});
	cancel.addEventListener('click', () => {
		window.notionElectronAPI.closeWindow();
	});
	updateManually.addEventListener('click', () => {
		window.notionElectronAPI.checkUpdateForced();
	});
	updateDownload.addEventListener('click', () => {
		window.notionElectronAPI.downloadUpdate();
	});
	updateInstall.addEventListener('click', () => {
		window.notionElectronAPI.installUpdate();
	});
});
