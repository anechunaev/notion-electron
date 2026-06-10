#!/usr/bin/env node

import { getCurrentChanges, getAllTrackedFiles } from './helpers/git.mjs';
import { lint } from './helpers/eslint.mjs';

async function run(scanAllFiles = false) {
	try {
		let files = [];
		if (scanAllFiles) {
			files = await getAllTrackedFiles();
		} else {
			files = await getCurrentChanges();
		}
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

run(process.argv[3] === '--all-files')
	.then(() => console.log(`✅ Linting done (exit code ${process.exitCode})`))
	.catch((error) => console.error('❌ Error while running linter:\n', error));
