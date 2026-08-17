#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

function parseArgs(argv) {
	const args = { version: '', date: '', notes: '', path: '' };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--version') args.version = argv[++i] ?? '';
		else if (arg === '--date') args.date = argv[++i] ?? '';
		else if (arg === '--notes') args.notes = argv[++i] ?? '';
		else args.path = arg;
	}
	return args;
}

function escapeXml(text) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text) {
	const linked = escapeXml(text).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
	const stripped = linked
		.replace(/&lt;https?:\/\/[^\s&]+&gt;/g, '')
		.replace(/https?:\/\/\S+/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	// appstreamcli rejects plain-text URLs in a description and GitHub's generated
	// notes are made of them ("… by @user in <url>", "Full Changelog: <url>"), so
	// the URL goes, and with it whatever its removal leaves dangling: a trailing
	// connector, or the whole line when it was only a label for the link.
	if (stripped !== linked.replace(/\s+/g, ' ').trim()) {
		if (/[:\-–—]$/.test(stripped)) return '';
		const trimmed = stripped.replace(/\s+(in|at|via|from|on)$/i, '');
		return /[a-z0-9]/i.test(trimmed.replace(/[*_`]/g, '')) ? markup(trimmed) : '';
	}

	return markup(stripped);
}

function markup(text) {
	return text
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<em>$1</em>')
		.replace(/__([^_]+)__/g, '<em>$1</em>')
		.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
		.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
		.trim();
}

// AppStream <description> accepts only p/ul/li/em/code, so the release body is
// mapped onto that subset; markdown passed through verbatim fails validation.
function toAppStream(markdown, indent) {
	const blocks = [];
	let para = [];
	let list = null;

	const flushPara = () => {
		if (!para.length) return;
		const text = inline(para.join(' '));
		para = [];
		if (text) blocks.push(`${indent}<p>${text}</p>`);
	};
	const flushList = () => {
		if (!list) return;
		const items = list.map(inline).filter(Boolean);
		list = null;
		if (!items.length) return;
		const rendered = items.map((item) => `${indent}  <li>${item}</li>`).join('\n');
		blocks.push(`${indent}<ul>\n${rendered}\n${indent}</ul>`);
	};

	const lines = markdown
		.replace(/\r\n?/g, '\n')
		.replace(/<!--[\s\S]*?-->/g, '')
		.split('\n');

	for (const raw of lines) {
		const line = raw.trim();

		if (!line) {
			flushPara();
			flushList();
			continue;
		}

		const item = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
		if (item) {
			flushPara();
			(list ??= []).push(item[1]);
			continue;
		}

		const heading = line.match(/^#{1,6}\s+(.*)$/);
		if (heading) {
			flushPara();
			flushList();
			para.push(heading[1]);
			flushPara();
			continue;
		}

		flushList();
		para.push(line);
	}

	flushPara();
	flushList();

	return blocks;
}

const { version, date, notes, path } = parseArgs(process.argv.slice(2));

if (!version || !date || !path) {
	console.error('Usage: stamp-metainfo.mjs --version <v> --date <YYYY-MM-DD> [--notes <file>] <metainfo-path>');
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

let description = '';
if (notes) {
	const blocks = toAppStream(readFileSync(notes, 'utf8'), '        ');
	if (blocks.length) {
		description = `      <description>\n${blocks.join('\n')}\n      </description>\n`;
	} else {
		console.log(`${notes} holds no usable release notes; stamping the version alone`);
	}
}

const entry =
	`\n    <release version="${version}" date="${date}">\n` +
	description +
	`      <url type="details">https://github.com/anechunaev/notion-electron/releases/tag/v${version}</url>\n` +
	`    </release>`;

const insertAt = openIndex + openTag.length;
const stamped = xml.slice(0, insertAt) + entry + xml.slice(insertAt);
writeFileSync(path, stamped);
console.log(`Stamped release ${version} (${date}) into ${path}`);
