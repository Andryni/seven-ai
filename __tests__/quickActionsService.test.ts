/**
 * The dashboard used to be the only entry point into every module — this
 * pins that long-press-the-app-icon shortcuts register the four highest
 * value actions and stay silent (no throw) when the native module is
 * unsupported, instead of crashing app boot.
 */
import * as QuickActions from 'expo-quick-actions';
import { quickActionsService, QUICK_ACTION_IDS } from '../src/services/quickActionsService';

jest.mock('expo-quick-actions', () => ({
  isSupported: jest.fn().mockResolvedValue(true),
  setItems: jest.fn().mockResolvedValue(undefined),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
}));

describe('quickActionsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registers all four shortcuts localized in English', async () => {
    await quickActionsService.registerDefaultActions('en');
    expect(QuickActions.setItems).toHaveBeenCalledTimes(1);
    const items = (QuickActions.setItems as jest.Mock).mock.calls[0][0];
    expect(items.map((i: any) => i.id)).toEqual([
      QUICK_ACTION_IDS.organize,
      QUICK_ACTION_IDS.briefing,
      QUICK_ACTION_IDS.research,
      QUICK_ACTION_IDS.build,
    ]);
    expect(items.find((i: any) => i.id === QUICK_ACTION_IDS.organize).title).toBe('Organize files');
  });

  it('localizes titles to French', async () => {
    await quickActionsService.registerDefaultActions('fr');
    const items = (QuickActions.setItems as jest.Mock).mock.calls[0][0];
    expect(items.find((i: any) => i.id === QUICK_ACTION_IDS.build).title).toBe('Créer un site');
  });

  it('swallows errors from setItems instead of throwing (older OS / unsupported device)', async () => {
    (QuickActions.setItems as jest.Mock).mockRejectedValueOnce(new Error('unsupported'));
    await expect(quickActionsService.registerDefaultActions('en')).resolves.toBeUndefined();
  });
});
