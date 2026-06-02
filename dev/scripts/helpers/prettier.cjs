const cp = require('node:child_process');

async function prettify(files) {
	return new Promise((resolve) => {
		const eslintProcess = cp.spawn(`npx prettier --write ${files}`, { shell: true, stdio: 'inherit' });
		eslintProcess.on('exit', (code) => {
			resolve(code);
		});
	});
}

module.exports = {
	prettify,
};
