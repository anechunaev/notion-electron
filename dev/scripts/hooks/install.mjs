#!/usr/bin/env node

import { execSync } from 'node:child_process';

// husky v9: `husky` sets git's core.hooksPath to ./.husky. The hooks themselves
// (e.g. .husky/pre-commit) are committed to the repo, so there is nothing to
// generate here. Skip in CI, where hooks are not needed.
if (process.env.CI) {
	process.exit(0);
}

try {
	execSync('husky', { stdio: 'inherit' });
	console.log('✅ Git hooks installed');
} catch (error) {
	console.error('❌ Error while installing hooks:\n', error);
}
