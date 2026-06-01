const cp = require('node:child_process');

async function lint(files) {
	return new Promise((resolve) => {
		const eslintProcess = cp.spawn(`npx eslint --fix ${files}`, { shell: true, stdio: 'inherit' });
		eslintProcess.on('exit', (code) => {
			resolve(code);
		});
	});
}

module.exports = {
	lint,
};
