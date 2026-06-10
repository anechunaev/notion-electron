import cp from 'node:child_process';

export async function prettify(files) {
	return new Promise((resolve) => {
		const eslintProcess = cp.spawn(`npx prettier --config ./prettier.config.js --write ${files}`, {
			shell: true,
			stdio: 'inherit',
		});
		eslintProcess.on('exit', (code) => {
			resolve(code);
		});
	});
}
