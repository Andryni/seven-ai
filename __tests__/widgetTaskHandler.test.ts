/**
 * The SevenStatus home-screen widget runs its render logic in a headless JS
 * context with no mounted `app/_layout.tsx` (so no `loadSavedConfig()` has
 * ever run for it) — these tests pin that the handler hydrates the store
 * itself, renders the widget only for WIDGET_ADDED/UPDATE/RESIZED, ignores
 * events for other widgets, and reflects the live assistant name/status
 * into the rendered tree.
 */
import { widgetTaskHandler } from '../src/widgets/widget-task-handler';
import { useSevenStore } from '../src/store/useSevenStore';

jest.mock('react-native-android-widget', () => ({
  registerWidgetTaskHandler: jest.fn(),
}));

jest.mock('../src/store/useSevenStore', () => ({
  useSevenStore: { getState: jest.fn() },
}));

jest.mock('../src/widgets/SevenWidget', () => ({
  SevenWidget: (props: any) => ({ type: 'SevenWidget', props }),
}));

function makeState(overrides: Partial<{ assistantName: string; themeColor: string; status: string }> = {}) {
  const loadSavedConfig = jest.fn().mockResolvedValue(undefined);
  const getState = jest.fn(() => ({
    config: {
      assistantName: overrides.assistantName ?? 'Seven AI',
      themeColor: overrides.themeColor ?? '#00E5FF',
    },
    status: overrides.status ?? 'idle',
    loadSavedConfig,
  }));
  (useSevenStore.getState as jest.Mock).mockImplementation(getState);
  return { loadSavedConfig };
}

describe('widgetTaskHandler', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ignores events for widgets other than SevenStatus', async () => {
    const { loadSavedConfig } = makeState();
    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SomeOtherWidget' } as any,
      widgetAction: 'WIDGET_ADDED',
      renderWidget,
    } as any);
    expect(renderWidget).not.toHaveBeenCalled();
    expect(loadSavedConfig).not.toHaveBeenCalled();
  });

  it('hydrates the store and renders on WIDGET_ADDED', async () => {
    const { loadSavedConfig } = makeState({ assistantName: 'Gideon', themeColor: '#FF3366', status: 'idle' });
    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SevenStatus' } as any,
      widgetAction: 'WIDGET_ADDED',
      renderWidget,
    } as any);
    expect(loadSavedConfig).toHaveBeenCalledTimes(1);
    expect(renderWidget).toHaveBeenCalledTimes(1);
    const rendered = renderWidget.mock.calls[0][0];
    expect(rendered.props.assistantName).toBe('Gideon');
    expect(rendered.props.accentColor).toBe('#FF3366');
    expect(rendered.props.statusLine).toBe('SYSTEMS NOMINAL');
  });

  it('surfaces a non-idle status in the status line, on both UPDATE and RESIZED', async () => {
    makeState({ status: 'thinking' });
    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SevenStatus' } as any,
      widgetAction: 'WIDGET_UPDATE',
      renderWidget,
    } as any);
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SevenStatus' } as any,
      widgetAction: 'WIDGET_RESIZED',
      renderWidget,
    } as any);
    expect(renderWidget).toHaveBeenCalledTimes(2);
    expect(renderWidget.mock.calls[0][0].props.statusLine).toBe('THINKING...');
    expect(renderWidget.mock.calls[1][0].props.statusLine).toBe('THINKING...');
  });

  it('does nothing on WIDGET_DELETED or WIDGET_CLICK (deep links handle taps)', async () => {
    const { loadSavedConfig } = makeState();
    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SevenStatus' } as any,
      widgetAction: 'WIDGET_DELETED',
      renderWidget,
    } as any);
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SevenStatus' } as any,
      widgetAction: 'WIDGET_CLICK',
      renderWidget,
    } as any);
    expect(renderWidget).not.toHaveBeenCalled();
    expect(loadSavedConfig).not.toHaveBeenCalled();
  });
});
