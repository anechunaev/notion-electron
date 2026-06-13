import { parseMessages, type Message } from 'd-bus-message-protocol';

export class MessageParser {
	#data: Uint8Array[] = [];
	parseMessages(data: Uint8Array): readonly Message[] | undefined {
		try {
			// parseMessages is typed for ArrayBuffer but accepts a Buffer at runtime.
			const messages = parseMessages(Buffer.concat([...this.#data, data]) as unknown as ArrayBuffer);
			this.#data = [];
			return messages;
		} catch (error) {
			if (error instanceof Error && error.message.includes(`bounds`)) {
				this.#data = [...this.#data, data];
				return undefined;
			}
			this.#data = [];
			throw error;
		}
	}
}

export default MessageParser;
