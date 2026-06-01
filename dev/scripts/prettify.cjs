#!/usr/bin/env node

const { getCurrentChanges, stageFiles } = require('./helpers/git.cjs');
const { prettify } = require('./helpers/prettier.cjs');

async function run() {
	try {
		const files = await getCurrentChanges();
		if (!files.length) {
			process.exitCode = 0;
			return;
		}
		process.exitCode = await prettify(files.join(' '));
		await stageFiles(files.join(' '));
	} catch (errorResponse) {
		process.exitCode = 127;
		throw errorResponse;
	}
}

run()
	.then(() => console.log(`✅ Prettifying done (exit code ${process.exitCode})`))
	.catch((error) => console.error('❌ Error while running prettier:\n', error));
