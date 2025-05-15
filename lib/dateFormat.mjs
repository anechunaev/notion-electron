import { execSync } from 'node:child_process';

export function getSystemFormattedDate(dateString) {
	let dateObject = dateString ? new Date(dateString) : new Date();
	if (isNaN(dateObject)) {
		dateObject = new Date();
	}
	const isoString = dateObject.toISOString();
	let dateStringFormatted;
	try {
		dateStringFormatted = execSync(
			`date -d ${isoString}`,
			{ stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
		).toString().trim();
	} catch (error) {
		dateStringFormatted = dateObject.toLocaleString();
	}
	return dateStringFormatted;
}
