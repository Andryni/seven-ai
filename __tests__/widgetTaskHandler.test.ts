/**
 * The SevenStatus home-screen widget runs its render logic in a headless JS
 * context with no mounted `app/_layout.tsx` (so no `loadSavedConfig()` has
 * ever run for it) — these tests pin that the handler hydrates the store
 * itself, renders the widget only for WIDGET_ADDED/UPDATE/RESIZED, ignores
 * events for other widgets, reflects the live assistant name/status into
 * the rendered tree, and fetches+formats the two glance facts (weather,
 * next calendar event) using the exact same services the in-app morning
 * briefing relies on.
 */
import { widgetTaskHandler } from '../src/widgets/widget-task-handler';
import { useSevenStore } from '../src/store/useSevenStore';
import { fetchWeather } from '../src/services/liveInfoService';
import { calendarService } from '../src/services/calendarService';

jest.mock('react-native-android-widget', () => ({
  registerWidgetTaskHandler: jest.fn(),
}));

jest.mock('../src/store/useSevenStore', () => ({
  useSevenStore: { getState: jest.fn() },
}));

jest.mock('../src/widgets/SevenWidget', () => ({
  SevenWidget: (props: any) => ({ type: 'SevenWidget', props }),
}));

jest.mock('../src/services/liveInfoService', () => ({
  fetchWeather: jest.fn(),
}));

jest.mock('../src/services/calendarService', () => ({
  calendarService: {
    hasPermission: jest.fn(),
    getTodayEvents: jest.fn(),
  },
}));

function makeState(
  overrides: Partial<{
    assistantName: string;
    themeColor: string;
    status: string;
    language: 'fr' | 'en';
    city: string;
  }> = {}
) {
  const loadSavedConfig = jest.fn().mockResolvedValue(undefined);
  const getState = jest.fn(() => ({
    config: {
      assistantName: overrides.assistantName ?? 'Seven AI',
      themeColor: overrides.themeColor ?? '#00E5FF',
      language: overrides.language,
      city: overrides.city,
    },
    status: overrides.status ?? 'idle',
    loadSavedConfig,
  }));
  (useSevenStore.getState as jest.Mock).mockImplementation(getState);
  return { loadSavedConfig };
}

describe('widgetTaskHandler', () => {
  beforeEach(() => {
    (fetchWeather as jest.Mock).mockResolvedValue(null);
    (calendarService.hasPermission as jest.Mock).mockResolvedValue(false);
    (calendarService.getTodayEvents as jest.Mock).mockResolvedValue(null);
  });

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
    expect(fetchWeather).not.toHaveBeenCalled();
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
    expect(fetchWeather).not.toHaveBeenCalled();
  });

  it('renders a live weather line using the configured city and language', async () => {
    makeState({ city: 'Antananarivo', language: 'fr' });
    (fetchWeather as jest.Mock).mockResolvedValue({
      tempC: 24,
      condition: 'Ciel dégagé',
      humidity: 55,
      windKmh: 5,
      location: 'Antananarivo',
      code: 0,
      isDay: true,
    });
    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SevenStatus' } as any,
      widgetAction: 'WIDGET_ADDED',
      renderWidget,
    } as any);
    expect(fetchWeather).toHaveBeenCalledWith('Antananarivo', 'fr');
    expect(renderWidget.mock.calls[0][0].props.weatherLine).toBe('24°C Ciel dégagé • Antananarivo');
  });

  it('falls back to an honest "unavailable" weather line when the fetch fails', async () => {
    makeState({ language: 'en' });
    (fetchWeather as jest.Mock).mockRejectedValue(new Error('network down'));
    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SevenStatus' } as any,
      widgetAction: 'WIDGET_ADDED',
      renderWidget,
    } as any);
    expect(renderWidget.mock.calls[0][0].props.weatherLine).toBe('Weather unavailable');
  });

  it('renders the next calendar event when permission is already granted', async () => {
    makeState({ language: 'en' });
    (calendarService.hasPermission as jest.Mock).mockResolvedValue(true);
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    farFuture.setHours(14, 30, 0, 0);
    const farFutureEnd = new Date(farFuture.getTime() + 30 * 60 * 1000);
    (calendarService.getTodayEvents as jest.Mock).mockResolvedValue([
      {
        id: '1',
        title: 'Team sync',
        startDate: farFuture,
        endDate: farFutureEnd,
        location: null,
        calendarTitle: 'Work',
        allDay: false,
      },
    ]);
    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SevenStatus' } as any,
      widgetAction: 'WIDGET_ADDED',
      renderWidget,
    } as any);
    expect(calendarService.getTodayEvents).toHaveBeenCalledTimes(1);
    // The widget formats the clock time in the configured UI language (en
    // here), not the device locale — see src/core/datetime.ts. 14:30 local
    // renders as "02:30 PM" in en-US.
    const expectedTime = farFuture.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    expect(renderWidget.mock.calls[0][0].props.nextEventLine).toBe(`${expectedTime} • Team sync`);
  });

  it('never reads the calendar when permission has not been granted', async () => {
    makeState({ language: 'en' });
    (calendarService.hasPermission as jest.Mock).mockResolvedValue(false);
    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetInfo: { widgetName: 'SevenStatus' } as any,
      widgetAction: 'WIDGET_ADDED',
      renderWidget,
    } as any);
    expect(calendarService.getTodayEvents).not.toHaveBeenCalled();
    expect(renderWidget.mock.calls[0][0].props.nextEventLine).toBe('Agenda unavailable');
  });
});
