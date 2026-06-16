import { nativeTheme } from 'electron';
import { MessageType } from 'd-bus-message-protocol';
import { stringType } from 'd-bus-type-system';
import type SessionDBus from '../lib/dbus/sessionDBus';
import type OptionsService from './options';

const DARK_THEME_BACKGROUND = '#202020';
const LIGHT_THEME_BACKGROUND = '#f8f8f7';

type DBusReadReply = { args?: ReadonlyArray<ReadonlyArray<ReadonlyArray<unknown>>> };

class ThemeService {
	private options: OptionsService;

	constructor(optionsService: OptionsService) {
		this.options = optionsService;
	}

	// eslint-disable-next-line publicMethods/public-class-methods-use-this
	public queryColorScheme(dBus: SessionDBus): Promise<unknown> {
		return dBus.callMethod({
			messageType: MessageType.MethodCall,
			objectPath: `/org/freedesktop/portal/desktop`,
			interfaceName: `org.freedesktop.portal.Settings`,
			memberName: `Read`,
			serial: dBus.nextSerial,
			destination: `org.freedesktop.portal.Desktop`,
			types: [stringType, stringType],
			args: ['org.freedesktop.appearance', 'color-scheme'],
		});
	}

	public applyThemeSource(): void {
		nativeTheme.themeSource = this.options.getOption('general-theme');
	}

	public resolveBackgroundColor(colorSchemeReply: unknown): string {
		const theme = this.options.getOption('general-theme');
		if (theme === 'system') {
			const colorScheme = (colorSchemeReply as DBusReadReply | undefined)?.args?.[0]?.[1]?.[1];
			return (colorScheme ?? nativeTheme.shouldUseDarkColors) ? DARK_THEME_BACKGROUND : LIGHT_THEME_BACKGROUND;
		}
		return theme === 'dark' ? DARK_THEME_BACKGROUND : LIGHT_THEME_BACKGROUND;
	}
}

export default ThemeService;
