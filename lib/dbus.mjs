import { createConnection } from 'node:net';
import { getuid } from 'node:process';
import { DBus } from '@clebert/node-d-bus';
import { MessageType, serializeMessage, parseMessages } from 'd-bus-message-protocol';

export class MessageParser {
	#data = [];
	parseMessages(data) {
		try {
			const messages = parseMessages(Buffer.concat([...this.#data, data]));
			this.#data = [];
			return messages;
		}
		catch (error) {
			if (error instanceof Error && error.message.includes(`bounds`)) {
				this.#data = [...this.#data, data];
				return undefined;
			}
			this.#data = [];
			throw error;
		}
	}
}

export class SessionDBus extends DBus {
	#state = [`disconnected`];

	get state() {
		return this.#state[0];
	}

	send(message) {
		if (this.#state[0] !== `connected`) {
			throw new Error(`Not connected.`);
		}
		this.#state[1].write(new Uint8Array(serializeMessage(message)));
	}

	async connectAsExternal() {
		if (this.#state[0] !== `disconnected`) {
			throw new Error(`Already connected.`);
		}
	
		this.#state = [`connecting`];
	
		return new Promise((resolve, reject) => {
			const address = process.env.DBUS_SESSION_BUS_ADDRESS ||
				`unix:path=/run/user/1000/bus`;

			if (!address.startsWith(`unix:path=`)) {
				throw new Error(`Only paths are supported as unix domain socket addresses.`);
			}

			const socket = createConnection(address.slice(10));

			socket.once(`error`, (error) => {
				if (this.#state[0] === `connecting`) {
					this.#state = [`failed`];
					reject(error);
				} else if (
					this.#state[0] === `connected`
					&& this.#state[1] === socket
				) {
					this.#state = [`failed`];
					this.emitError(error);
				}
			});

			const messageParser = new MessageParser();

			socket.on(`data`, (data) => {
				if (this.#state[0] === `connecting`) {
					if (data.toString().startsWith(`OK`)) {
						this.#state = [`connected`, socket];
						socket.write(`BEGIN\r\n`);
						resolve();
					} else {
						this.#state = [`failed`];
						reject(new Error(`External authentication failed.`));
					}
				} else if (
					this.#state[0] === `connected`
					&& this.#state[1] === socket
				) {
					for (const message of messageParser.parseMessages(data) ?? []) {
						this.emitMessage(message);
					}
				}
			});
			socket.setNoDelay(true);
			socket.write(`\0`);
			const id = Buffer.from(getuid().toString(), `ascii`).toString(`hex`);
			socket.write(`AUTH EXTERNAL ${id}\r\n`);
		});
	}
	disconnect() {
		if (this.#state[0] !== `connected`) {
			throw new Error(`Not connected.`);
		}
		this.#state[1].destroy();
		this.#state = [`disconnected`];
	}
}

export async function createMonitorBus({
	requestedName,
	onError,
}) {
	const dBus = new SessionDBus();
	const signalListeners = new Map();

	await dBus.connectAsExternal();

	dBus.onError((error) => {
		onError?.(error);
	});
	dBus.onMessage((message) => {
		if (signalListeners.has(message.memberName)) {
			signalListeners.get(message.memberName)(message);
		}
	});

	await dBus.hello();

	await dBus.callMethod({
		types: [
			{
				typeCode: 's',
				bytePadding: 4,
				predicate: (value) => typeof value === 'string',
			},
			{
				typeCode: 'u',
				bytePadding: 4,
				predicate: (value) => Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF,
				minValue: 0,
				maxValue: 0xFFFFFFFF,
			},
		],
		args: [
			requestedName,
			1,
		],
		messageType: MessageType.MethodCall,
		objectPath: `/org/freedesktop/DBus`,
		interfaceName: `org.freedesktop.DBus`,
		memberName: `RequestName`,
		serial: dBus.nextSerial,
		destination: `org.freedesktop.DBus`,
	});

	return {
		dBus,
		disconnect: () => {
			dBus.disconnect();
		},
		addSignalListener: (signalName, callback) => {
			signalListeners.set(signalName, callback);
		},
		removeSignalListener: (signalName) => {
			signalListeners.delete(signalName);
		},
	};
}
