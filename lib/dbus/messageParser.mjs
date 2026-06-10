import { parseMessages } from 'd-bus-message-protocol';

export class MessageParser {
	#data = [];
	parseMessages(data) {
		try {
			const messages = parseMessages(Buffer.concat([...this.#data, data]));
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
