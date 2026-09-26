import * as FileSystem from 'expo-file-system/legacy';
import { autonomousCoreService } from '../src/services/autonomousCoreService';

jest.mock('expo-file-system/legacy');

describe('autonomousCoreService', () => {
  beforeAll(async () => {
    (FileSystem as any).__resetMockFS?.();
    await autonomousCoreService.initialize();
  });

  it('runs dependency-ready agents in bounded parallel stages', async () => {
    const mission = autonomousCoreService.create({
      title: 'Parallel test', objective: 'Verify DAG', maxParallel: 2,
      nodes: [
        { id: 'plan', label: 'Plan', agent: 'GIDEON' },
        { id: 'a', label: 'A', agent: 'ATHENA', dependencies: ['plan'] },
        { id: 'b', label: 'B', agent: 'DAVE', dependencies: ['plan'] },
        { id: 'approval', label: 'Approve', agent: 'JANUS', dependencies: ['a', 'b'], requiresApproval: true },
      ],
    });
    await autonomousCoreService.runReady(mission.id, async (node) => `done:${node.id}`);
    let current = autonomousCoreService.getSnapshot().find((item) => item.id === mission.id)!;
    expect(current.nodes.find((node) => node.id === 'plan')?.state).toBe('completed');
    expect(current.nodes.filter((node) => ['a', 'b'].includes(node.id)).every((node) => node.state === 'ready')).toBe(true);

    await autonomousCoreService.runReady(mission.id, async (node) => `done:${node.id}`);
    current = autonomousCoreService.getSnapshot().find((item) => item.id === mission.id)!;
    expect(current.nodes.find((node) => node.id === 'approval')?.state).toBe('awaiting_approval');
    autonomousCoreService.approve(mission.id, 'approval');
    await autonomousCoreService.runReady(mission.id, async () => 'approved');
    current = autonomousCoreService.getSnapshot().find((item) => item.id === mission.id)!;
    expect(current.state).toBe('completed');
  });

  it('keeps a checkpoint and retries within the mission budget', async () => {
    const mission = autonomousCoreService.create({ title: 'Retry', objective: 'Retry safely', maxAttempts: 2, nodes: [{ id: 'risky', label: 'Risky', agent: 'JANUS' }] });
    await autonomousCoreService.runReady(mission.id, async () => { throw new Error('transient'); });
    let node = autonomousCoreService.getSnapshot().find((item) => item.id === mission.id)!.nodes[0];
    expect(node.state).toBe('checkpointed');
    expect(node.checkpoint).toBeDefined();
    await autonomousCoreService.runReady(mission.id, async () => 'recovered');
    node = autonomousCoreService.getSnapshot().find((item) => item.id === mission.id)!.nodes[0];
    expect(node.state).toBe('completed');
  });
});
