import { app } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PackageFormat, UpdateMode } from '../../shared/ipc';

const FLATPAK_INFO_PATH = '/.flatpak-info';
const FPM_FORMATS = ['deb', 'rpm', 'pacman'];

const FORMAT_LABELS: Record<PackageFormat, string> = {
	appimage: 'AppImage',
	flatpak: 'Flatpak',
	snap: 'Snap',
	deb: 'deb package',
	rpm: 'rpm package',
	pacman: 'pacman package',
	unpacked: 'Unpacked build',
	development: 'Development build',
};

const UPDATE_MODES: Record<PackageFormat, UpdateMode> = {
	appimage: 'in-app',
	flatpak: 'store',
	snap: 'store',
	deb: 'package-manager',
	rpm: 'package-manager',
	pacman: 'package-manager',
	unpacked: 'none',
	development: 'none',
};

// electron-builder writes this file for deb/rpm/pacman targets; it is the only
// way to tell those formats apart, and electron-updater reads it too.
function readFpmFormat(): PackageFormat | null {
	try {
		const format = readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim();
		return FPM_FORMATS.includes(format) ? (format as PackageFormat) : null;
	} catch {
		return null;
	}
}

function resolvePackageFormat(): PackageFormat {
	if (existsSync(FLATPAK_INFO_PATH) || process.env.FLATPAK_ID) return 'flatpak';
	if (process.env.SNAP && process.env.SNAP_NAME) return 'snap';
	// `npm start` sets APPIMAGE=/ so the in-app update flow stays testable in dev.
	if (process.env.APPIMAGE) return 'appimage';
	if (!app.isPackaged) return 'development';
	return readFpmFormat() ?? 'unpacked';
}

let detectedFormat: PackageFormat | null = null;

export function detectPackageFormat(): PackageFormat {
	detectedFormat ??= resolvePackageFormat();
	return detectedFormat;
}

export function getPackageFormatLabel(format: PackageFormat): string {
	return FORMAT_LABELS[format];
}

export function getUpdateMode(format: PackageFormat): UpdateMode {
	return UPDATE_MODES[format];
}
