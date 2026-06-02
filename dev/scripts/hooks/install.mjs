#!/usr/bin/env node

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

async function run() {
	if (process.env.CI) return;
	await cp.exec('husky install');

	if (fs.existsSync(path.resolve(process.cwd(), './.husky'))) return;
	await cp.exec('npx husky add .husky/pre-commit "npm run lint"');
	// await cp.exec('npx husky add .husky/pre-push "npm run lint:deep"');
}

run()
	.then(() => console.log(`✅ Git hooks installed`))
	.catch((error) => console.error('❌ Error while installing hooks:\n', error));
