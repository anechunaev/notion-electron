import { getSystemFormattedDate } from '../lib/dateFormat.mjs';

class ChangelogService {
	#apiUrl;

	constructor(repoOwner, repoName) {
		this.#apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases`;
	}

	async fetch() {
		try {
			const response = await fetch(this.#apiUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch changelog: ${response.statusText}`);
			}

			const releases = await response.json();
			return releases.map(release => ({
				version: release.tag_name,
				date: release.published_at,
				notes: release.body,
				url: release.html_url,
			}));
		} catch (error) {
			console.error('Error fetching changelog:', error);
			return [];
		}
	}

	async html(data) {
		if (!data || !data.length) {
			return '<p>No changelog available.</p>';
		}

		const changelogHtml = data.map(release => `
			<dt>
				<a href="${release.url}" target="_blank">${release.version}</a>
				<br />
				<small>${getSystemFormattedDate(release.date)}</small>
			</dt>
			<dd>${release.notes.replace(/\n/g, '<br />')}</dd>
		`).join('');

		return `<dl>${changelogHtml}</dl>`;
	}
}

export default ChangelogService;
