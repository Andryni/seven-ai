/**
 * Pins `list_routines`' rendering of every trigger type — most importantly
 * the conditional triggers (battery_low / calendar_soon / wifi_connect),
 * which carry no hour/minute at all and used to render as
 * "daily at undefined:undefined", feeding the model nonsense it then relayed
 * to the user.
 */
import { executeTool } from '../src/core/sevenAgentTools';
import { useSevenStore } from '../src/store/useSevenStore';
import type { AutomationRoutine } from '../src/types';

jest.mock('../src/services/fileOrganizer', () => ({ fileOrganizer: {} }));
jest.mock('../src/core/daveAgent', () => ({ daveAgent: {} }));
jest.mock('../src/services/researchService', () => ({ researchService: {} }));
jest.mock('../src/services/gmailService', () => ({ gmailService: {} }));
jest.mock('../src/services/instagramService', () => ({ instagramService: {} }));
jest.mock('../src/core/selfHealing', () => ({ selfHealing: {} }));
jest.mock('../src/services/deviceControlService', () => ({ deviceControl: {} }));
jest.mock('../src/services/webSearchService', () => ({ webSearchService: {} }));
jest.mock('../src/services/sandboxService', () => ({ sandboxService: {} }));
jest.mock('../src/services/memoryService', () => ({ memoryService: {} }));
jest.mock('../src/services/contactsService', () => ({ contactsService: {} }));
jest.mock('../src/services/calendarService', () => ({ calendarService: {} }));
jest.mock('../src/services/routineService', () => ({
  routineService: {},
  validateTrigger: jest.fn(() => null),
  isTimeBasedTrigger: (type: string) => ['daily', 'weekly', 'once'].includes(type),
}));

function makeRoutine(overrides: Partial<AutomationRoutine>): AutomationRoutine {
  return {
    id: 'r',
    name: 'Test routine',
    trigger: { type: 'daily', hour: 8, minute: 0 },
    action: { type: 'reminder', payload: 'hi' },
    enabled: true,
    createdAt: 0,
    ...overrides,
  };
}

async function listText(routines: AutomationRoutine[]): Promise<string> {
  useSevenStore.setState({ automationRoutines: routines });
  const result = await executeTool('list_routines', {});
  return result.text;
}

describe('executeTool list_routines trigger descriptions', () => {
  afterEach(() => {
    useSevenStore.setState({ automationRoutines: [] });
  });

  it('describes a daily trigger with its time', async () => {
    const text = await listText([makeRoutine({ name: 'Morning', trigger: { type: 'daily', hour: 8, minute: 5 } })]);
    expect(text).toContain('daily at 08:05');
  });

  it('describes a weekly trigger with the weekday name', async () => {
    const text = await listText([
      makeRoutine({ name: 'Weekly', trigger: { type: 'weekly', hour: 9, minute: 0, weekday: 2 } }),
    ]);
    expect(text).toContain('every Monday at 09:00');
  });

  it('describes a once trigger with its date', async () => {
    const text = await listText([
      makeRoutine({ name: 'Once', trigger: { type: 'once', hour: 17, minute: 30, date: '2026-10-01' } }),
    ]);
    expect(text).toContain('once, on 2026-10-01 at 17:30');
  });

  it('describes battery_low by threshold, never "undefined:undefined"', async () => {
    const text = await listText([
      makeRoutine({ name: 'Low', trigger: { type: 'battery_low', batteryThreshold: 15 } }),
    ]);
    expect(text).toContain('battery drops to/below 15%');
    expect(text).not.toContain('undefined');
  });

  it('describes calendar_soon with its lead time', async () => {
    const text = await listText([
      makeRoutine({ name: 'Soon', trigger: { type: 'calendar_soon', minutesBefore: 10 } }),
    ]);
    expect(text).toContain('10 min before a calendar event');
    expect(text).not.toContain('undefined');
  });

  it('describes wifi_connect without any clock time', async () => {
    const text = await listText([makeRoutine({ name: 'Wifi', trigger: { type: 'wifi_connect' } })]);
    expect(text).toContain('connects to Wi-Fi');
    expect(text).not.toContain('undefined');
  });

  it('lists nothing when no routines exist', async () => {
    const text = await listText([]);
    expect(text).toContain('No automation routines');
  });
});
