export function parseSemver(version: string): [number, number, number] {
	const [major = 0, minor = 0, patch = 0] = (version.split('-')[0] ?? '').split('.').map(Number);
	return [major, minor, patch];
}

export function isSemverBigger(a: string, b: string): boolean {
	const [aMajor, aMinor, aPatch] = parseSemver(a);
	const [bMajor, bMinor, bPatch] = parseSemver(b);

	return aMajor > bMajor || aMinor > bMinor || aPatch > bPatch;
}
