import { createConnection, type Socket } from 'node:net';
import { getuid } from 'node:process';
import { DBus } from '@clebert/node-d-bus';
import { serializeMessage, type Message } from 'd-bus-message-protocol';
import MessageParser from './messageParser';

type ConnectionState = ['disconnected'] | ['connecting'] | ['failed'] | ['connected', Socket];

class SessionDBus extends DBus {
	private sessionState: ConnectionState = ['disconnected'];

	public get state(): ConnectionState[0] {
		return this.sessionState[0];
	}

	public send(message: Message): void {
		const state = this.sessionState;
		if (state[0] !== 'connected') {
			throw new Error('Not connected.');
		}
		state[1].write(new Uint8Array(serializeMessage(message)));
	}

	public async connectAsExternal(): Promise<void> {
		if (this.sessionState[0] !== 'disconnected') {
			throw new Error('Already connected.');
		}

		this.sessionState = ['connecting'];

		return new Promise<void>((resolve, reject) => {
			const address = process.env.DBUS_SESSION_BUS_ADDRESS || 'unix:path=/run/user/1000/bus';

			if (!address.startsWith('unix:path=')) {
				throw new Error('Only paths are supported as unix domain socket addresses.');
			}

			const socket = createConnection(address.slice(10));

			socket.once('error', (error) => {
				const state = this.sessionState;
				if (state[0] === 'connecting') {
					this.sessionState = ['failed'];
					reject(error);
				} else if (state[0] === 'connected' && state[1] === socket) {
					this.sessionState = ['failed'];
					this.emitError(error);
				}
			});

			const messageParser = new MessageParser();

			socket.on('data', (data: Buffer) => {
				const state = this.sessionState;
				if (state[0] === 'connecting') {
					if (data.toString().startsWith('OK')) {
						this.sessionState = ['connected', socket];
						socket.write('BEGIN\r\n');
						resolve();
					} else {
						this.sessionState = ['failed'];
						reject(new Error('External authentication failed.'));
					}
				} else if (state[0] === 'connected' && state[1] === socket) {
					for (const message of messageParser.parseMessages(data) ?? []) {
						this.emitMessage(message);
					}
				}
			});
			socket.setNoDelay(true);
			socket.write('\0');
			const id = Buffer.from(getuid!().toString(), 'ascii').toString('hex');
			socket.write(`AUTH EXTERNAL ${id}\r\n`);
		});
	}

	public disconnect(): void {
		const state = this.sessionState;
		if (state[0] !== 'connected') {
			throw new Error('Not connected.');
		}
		state[1].destroy();
		this.sessionState = ['disconnected'];
	}
}

export default SessionDBus;
