interface GithubRelease {
	tag_name: string;
	published_at: string;
	body: string;
	html_url: string;
}

export interface ChangelogEntry {
	version: string;
	date: string;
	notes: string;
	url: string;
}

class ChangelogService {
	private apiUrl: string;

	constructor(repoOwner: string, repoName: string) {
		this.apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases`;
	}

	public async fetch(): Promise<ChangelogEntry[]> {
		try {
			const response = await fetch(this.apiUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch changelog: ${response.statusText}`);
			}

			const releases = (await response.json()) as GithubRelease[];
			return releases.map((release) => ({
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
}

export default ChangelogService;
