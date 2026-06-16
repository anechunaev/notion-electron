const SIZES = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];

export function bytesSizeToHuman(bytes: number): string {
	if (bytes === 0) return '0 Byte';
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return Math.round(bytes / Math.pow(1024, i)) + ' ' + (SIZES[i] ?? '');
}
