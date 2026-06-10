import { MessageType } from 'd-bus-message-protocol';
import SessionDBus from './dbus/sessionDBus.mjs';

export async function createMonitorBus({ requestedName, onError }) {
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
				predicate: (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
				minValue: 0,
				maxValue: 0xffffffff,
			},
		],
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
