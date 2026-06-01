#!/usr/bin/env node

import { getCurrentChanges } from './helpers/git.mjs';
import { lint } from './helpers/eslint.mjs';

async function run() {
	try {
		const files = await getCurrentChanges();
		if (!files.length) return process.exitCode = 0;
		process.exitCode = await lint(files.join(' '));
	} catch (errorResponse) {
		process.exitCode = 127;
		throw error;
	}
}

run()
	.then(() => console.log(`✅ Linting done (exit code ${process.exitCode})`))
	.catch((error) => console.error('❌ Error while running linter:\n', error))
