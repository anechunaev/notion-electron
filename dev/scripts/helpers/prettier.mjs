import cp from 'node:child_process';

export async function prettify(files) {
	return new Promise((resolve, reject) => {
		const eslintProcess = cp.spawn('npx prettier --write ' + files, { shell: true, stdio: "inherit"});
		eslintProcess.on('exit', (code) => {
			resolve(code);
		});
	})
}
