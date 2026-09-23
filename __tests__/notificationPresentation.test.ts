/**
 * The handler is the only thing that makes a foreground routine visible, and
 * the failure mode is silent (nothing at all is shown), so the behaviour is
 * pinned here: installed once, showing both the banner and the tray entry.
 */
// `mock`-prefixed on purpose: jest.mock factories may only close over
// variables named that way.
const mockSetNotificationHandler = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
}));

function loadModule(platform: string) {
  jest.resetModules();
  jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/services/notificationPresentation') as typeof import('../src/services/notificationPresentation');
}

describe('installNotificationHandler', () => {
  beforeEach(() => mockSetNotificationHandler.mockClear());

  it('shows the notification as a banner and in the tray, with sound', async () => {
    const { installNotificationHandler } = loadModule('android');
    installNotificationHandler();

    expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = mockSetNotificationHandler.mock.calls[0][0] as {
      handleNotification: () => Promise<Record<string, boolean>>;
    };
    const behavior = await handler.handleNotification();
    expect(behavior).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('installs only once per process', () => {
    const { installNotificationHandler } = loadModule('android');
    installNotificationHandler();
    installNotificationHandler();
    installNotificationHandler();
    expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
  });

  it('does nothing on web, which has no notification handler', () => {
    const { installNotificationHandler } = loadModule('web');
    installNotificationHandler();
    expect(mockSetNotificationHandler).not.toHaveBeenCalled();
  });
});
