import { Notification } from 'electron';

class NotificationService {
	// TODO: Either turn into library or full service
	// eslint-disable-next-line publicMethods/public-class-methods-use-this
	public notify({ title, body, icon }: { title?: string; body?: string; icon?: string }): void {
		if (Notification.isSupported()) {
			const notification = new Notification({
				title: title || 'Notification',
				body: body || '',
				...(icon ? { icon } : {}),
			});
			notification.show();
		} else {
			console.warn('Notifications are not supported on this platform.');
		}
	}
}

export default NotificationService;
