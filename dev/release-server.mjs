import { createServer } from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readConfig() {
	return fs.readFileSync(path.join(__dirname, './release-server-config.json'));
}

function emulateStream() {
	const s = new Readable();
	s._read = function noop() {};

	let counter = 0;
	const int = setInterval(() => {
		s.push(counter + '\n');
		counter++;
		
		if (counter >= 100) {
			clearInterval(int);
			s.push(null);
		}
	}, 200);

	return s;
}

function typeOf(obj) {
	if (obj === null) return 'null';
	if (Array.isArray(obj)) return 'array';
	return typeof obj;
}

function json2yaml(data) {
	let indentLevel = '';
	const handlers = {
		"noop": () => '',
		"undefined": () => 'null',
		"null": () => 'null',
		"number": x => x,
		"boolean": x => x ? 'true' : 'false',
		"string": x => JSON.stringify(x),
		"function": () => '[object Function]',
		"array": (x) => {
			let output = '';

			if (0 === x.length) {
				output += '[]';
				return output;
			}

			indentLevel = indentLevel.replace(/$/, '  ');
			x.forEach((y) => {
				const handler = handlers[typeOf(y)] ?? handlers.noop;
				output += '\n' + indentLevel + '- ' + handler(y, true);
			});
			indentLevel = indentLevel.replace(/  /, '');

			return output;
		},
		"object": (x, inArray, rootNode) => {
			let output = '';

			if (0 === Object.keys(x).length) {
				output += '{}';
				return output;
			}

			if (!rootNode) {
				indentLevel = indentLevel.replace(/$/, '  ');
			}

			Object.keys(x).forEach((k, i) => {
				const handler = handlers[typeOf(x[k])] ?? handlers.noop;

				if (!(inArray && i === 0)) {
					output += '\n' + indentLevel;
				}

				output += k + ': ' + handler(x[k]);
			});
			indentLevel = indentLevel.replace(/  /, '');

			return output;
		},
	};

	return (handlers[typeOf(data)](data, true, true) + '\n');
}

const server = createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost:8123');
	console.log('>', req.url);

	switch (url.pathname) {
		case '/':
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			return res.end('Hello, world!');

		case '/release':
			res.writeHead(200, { 'Content-Type': 'application/json' });
			return res.end(readConfig());

		case '/release/latest-linux.yml':
			res.writeHead(200, { 'Content-Type': 'application/yaml' });
			return res.end(json2yaml(JSON.parse(readConfig())));

		case '/release/notion-electron.x86_64.AppImage':
		case '/release/notion-electron.x86_64.deb':
		case '/release/notion-electron.x86_64.rpm':
			if (!req.headers.range) {
				res.writeHead(200, {
					'Content-Type': 'application/octet-stream',
					'Content-Length': 290,
				});
				return emulateStream().pipe(res);
			}

			const size = 290;
			let [ start, end ] = req.headers.range.replace('bytes=', '').split('-').map(Number);
			end = end ?? size - 1;

			if (start >= size || end >= size) {
				res.writeHead(416, { 'Content-Type': 'text/plain' });
				return res.end('Range Not Satisfiable');
			}

			const stream = fs.createReadStream(path.join(__dirname, './notion-electron.x86_64'), { start, end });

			res.writeHead(206, {
				'Content-Disposition': `attachment; filename="${path.basename(url.pathname)}"`,
				'Accept-Ranges': 'bytes',
				'Content-Range': `bytes ${start}-${end}/${size}`,
				'Content-Length': end - start + 1,
			});
			return stream.pipe(res);

		default:
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			return res.end('Not found');
	}
});

server.listen(8123, () => {
	console.log('Server is running on http://localhost:8123');
});
