import { session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import NotificationService from '../services/notifications';

export async function loadExtensions(extensionPaths: string[]): Promise<void> {
	if (extensionPaths.length === 0) return;
	const notificationService = new NotificationService();

	await Promise.all(
		extensionPaths.map(async (extensionPath) => {
			const resolvedPath = path.resolve(extensionPath);
			const extensionDir = fs.statSync(resolvedPath, { throwIfNoEntry: false })?.isFile()
				? path.dirname(resolvedPath)
				: resolvedPath;
			try {
				await session.defaultSession.extensions.loadExtension(extensionDir);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Failed to load extension from "${extensionPath}": ${message}`);
				notificationService.notify({
					title: 'Extension failed to load',
					body: `${path.basename(extensionDir)}: ${message}`,
				});
			}
		}),
	);
}
