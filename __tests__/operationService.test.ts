const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
}));

// eslint-disable-next-line import/first
import { agentForTool, operationService } from '../src/services/operationService';

describe('persistent operation service', () => {
  beforeAll(async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    await operationService.initialize();
  });

  beforeEach(() => {
    operationService.clearFinished();
    jest.clearAllMocks();
    mockWriteAsStringAsync.mockResolvedValue(undefined);
  });

  it('tracks a real operation through progress, delegation and completion', () => {
    const id = operationService.begin({
      kind: 'research',
      title: 'Investigate orbital computing',
      steps: ['Plan', 'Acquire', 'Verify', 'Report'],
    });
    operationService.assign(id, 'ATHENA');
    operationService.progress(id, 70, 'Verifying sources', 2);

    let operation = operationService.getSnapshot().find((item) => item.id === id)!;
    expect(operation.agent).toBe('ATHENA');
    expect(operation.progress).toBe(70);
    expect(operation.steps.map((step) => step.state)).toEqual(['completed', 'completed', 'running', 'pending']);

    operationService.complete(id, 'Dossier compiled');
    operation = operationService.getSnapshot().find((item) => item.id === id)!;
    expect(operation.state).toBe('completed');
    expect(operation.progress).toBe(100);
    expect(operation.steps.every((step) => step.state === 'completed')).toBe(true);
  });

  it('pauses and resumes without accepting progress while paused', () => {
    const id = operationService.begin({ kind: 'build', title: 'Versioned build' });
    operationService.progress(id, 30, 'Compiling', 1);
    operationService.pause(id);
    operationService.progress(id, 80, 'Should wait', 2);
    let operation = operationService.getSnapshot().find((item) => item.id === id)!;
    expect(operation.state).toBe('paused');
    expect(operation.progress).toBe(30);

    operationService.resume(id);
    operationService.progress(id, 80, 'Continued', 2);
    operation = operationService.getSnapshot().find((item) => item.id === id)!;
    expect(operation.state).toBe('running');
    expect(operation.progress).toBe(80);
  });

  it('maps tools onto visible specialist agents', () => {
    expect(agentForTool('research_pdf')).toBe('ATHENA');
    expect(agentForTool('routine')).toBe('ARES');
    expect(agentForTool('dave_build')).toBe('DAVE');
    expect(agentForTool('gmail_read')).toBe('HERMES');
    expect(agentForTool('self_heal')).toBe('JANUS');
  });
});
