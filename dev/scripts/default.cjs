#!/usr/bin/env node

const { getCurrentChanges } = require('./helpers/git.cjs');
const { lint } = require('./helpers/eslint.cjs');

async function run() {
	try {
		const files = await getCurrentChanges();
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
	.then(() => console.log(`✅ Linting done (exit code ${process.exitCode})`))
	.catch((error) => console.error('❌ Error while running linter:\n', error));
