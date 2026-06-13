import { execSync } from 'node:child_process';

export function getSystemFormattedDate(dateString?: string | null): string {
	let dateObject = dateString ? new Date(dateString) : new Date();
	if (isNaN(dateObject.getTime())) {
		dateObject = new Date();
	}
	const isoString = dateObject.toISOString();
	let dateStringFormatted: string;
	try {
		dateStringFormatted = execSync(`date -d ${isoString}`, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
			.toString()
			.trim();
	} catch (_error) {
		dateStringFormatted = dateObject.toLocaleString();
	}
	return dateStringFormatted;
}
