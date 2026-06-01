import cp from 'node:child_process';

export async function lint(files) {
	return new Promise((resolve, reject) => {
		const eslintProcess = cp.spawn('npx eslint --fix ' + files, { shell: true, stdio: "inherit"});
		eslintProcess.on('exit', (code) => {
			resolve(code);
		});
	})
}
