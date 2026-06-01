#!/usr/bin/env node

import { getChangesFromMergeBase } from './helpers/git.mjs';
import { lint } from './helpers/eslint.mjs';

async function run() {
	try {
		const files = await getChangesFromMergeBase();
		if (!files.length) return process.exitCode = 0;
		process.exitCode = await lint(files.join(' '));
	} catch (errorResponse) {
		process.exitCode = 127;
		throw errorResponse;
	}
}

run()
	.then(() => console.log(`✅ Deep linting done (exit code ${process.exitCode})`))
	.catch((error) => console.error('❌ Error while running linter:\n', error))
