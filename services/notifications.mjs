import { Notification } from 'electron';

class NotificationService {
	notify({ title, body, icon }) {
		if (Notification.isSupported()) {
			const notification = new Notification({
				title: title || 'Notification',
				body: body || '',
				icon: icon || null,
			});
			notification.show();
		} else {
			console.warn('Notifications are not supported on this platform.');
		}
	}
}

export default NotificationService;
