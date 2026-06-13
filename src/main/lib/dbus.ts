import { MessageType, type Message } from 'd-bus-message-protocol';
import { stringType, uint32Type } from 'd-bus-type-system';
import SessionDBus from './dbus/sessionDBus';

export type SignalListener = (message: Message) => void;

export interface CreateMonitorBusOptions {
	requestedName: string;
	onError?: ((error: Error) => void) | undefined;
}

export async function createMonitorBus({ requestedName, onError }: CreateMonitorBusOptions) {
	const dBus = new SessionDBus();
	const signalListeners = new Map<string, SignalListener>();

	await dBus.connectAsExternal();

	dBus.onError((error) => {
		onError?.(error);
	});
	dBus.onMessage((message) => {
		if (`memberName` in message && signalListeners.has(message.memberName)) {
			signalListeners.get(message.memberName)?.(message);
		}
	});

	await dBus.hello();

	await dBus.callMethod({
		types: [stringType, uint32Type],
		args: [requestedName, 1],
		messageType: MessageType.MethodCall,
		objectPath: `/org/freedesktop/DBus`,
		interfaceName: `org.freedesktop.DBus`,
		memberName: `RequestName`,
		serial: dBus.nextSerial,
		destination: `org.freedesktop.DBus`,
	});

	return {
		dBus,
		disconnect: (): void => {
			dBus.disconnect();
		},
		addSignalListener: (signalName: string, callback: SignalListener): void => {
			signalListeners.set(signalName, callback);
		},
		removeSignalListener: (signalName: string): void => {
			signalListeners.delete(signalName);
		},
	};
}
