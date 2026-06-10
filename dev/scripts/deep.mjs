#!/usr/bin/env node

import { getChangesFromMergeBase } from './helpers/git.cjs';
import { lint } from './helpers/eslint.cjs';

async function run() {
	try {
		const files = await getChangesFromMergeBase();
		if (!files.length) {
			process.exitCode = 0;
			return;
		}
		process.exitCode = await lint(files.join(' '));
	} catch (errorResponse) {
		process.exitCode = 127;
		throw errorResponse;
	}
}

run()
	.then(() => console.log(`✅ Deep linting done (exit code ${process.exitCode})`))
	.catch((error) => console.error('❌ Error while running linter:\n', error));
