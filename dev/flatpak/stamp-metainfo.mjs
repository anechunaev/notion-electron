#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

function parseArgs(argv) {
	const args = { version: '', date: '', path: '' };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--version') args.version = argv[++i] ?? '';
		else if (arg === '--date') args.date = argv[++i] ?? '';
		else args.path = arg;
	}
	return args;
}

const { version, date, path } = parseArgs(process.argv.slice(2));

if (!version || !date || !path) {
	console.error('Usage: stamp-metainfo.mjs --version <v> --date <YYYY-MM-DD> <metainfo-path>');
	process.exit(1);
}

const xml = readFileSync(path, 'utf8');

if (new RegExp(`<release\\s+version="${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(xml)) {
	console.log(`metainfo already lists release ${version}; leaving unchanged`);
	process.exit(0);
}

const openTag = '<releases>';
const openIndex = xml.indexOf(openTag);
if (openIndex === -1) {
	console.error(`No <releases> element found in ${path}`);
	process.exit(1);
}

const entry =
	`\n    <release version="${version}" date="${date}">\n` +
	`      <url type="details">https://github.com/anechunaev/notion-electron/releases/tag/v${version}</url>\n` +
	`    </release>`;

const insertAt = openIndex + openTag.length;
const stamped = xml.slice(0, insertAt) + entry + xml.slice(insertAt);
writeFileSync(path, stamped);
console.log(`Stamped release ${version} (${date}) into ${path}`);
