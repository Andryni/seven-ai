import { useSyncExternalStore } from 'react';
import { storageService } from './storageService';
import type { OperationAgent } from './operationService';

export type AutonomousNodeState = 'blocked' | 'ready' | 'running' | 'checkpointed' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
export interface AutonomousNode {
  id: string;
  label: string;
  agent: OperationAgent;
  dependencies: string[];
  state: AutonomousNodeState;
  progress: number;
  attempts: number;
  maxAttempts: number;
  requiresApproval?: boolean;
  approvedAt?: number;
  risk?: 'low' | 'medium' | 'high' | 'critical';
  checkpoint?: { timestamp: number; payload?: unknown };
  result?: string;
  error?: string;
}
export interface AutonomousMission {
  id: string;
  title: string;
  objective: string;
  state: 'active' | 'paused' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  budget: { maxParallel: number; maxAttempts: number; deadlineMs?: number };
  nodes: AutonomousNode[];
}

const FILE = `${storageService.getDocumentDirectory()}autonomous_missions.json`;
const listeners = new Set<() => void>();
let missions: AutonomousMission[] = [];
let initialized = false;
const emit = () => listeners.forEach((listener) => listener());
const persist = () => storageService.writeAsString(FILE, JSON.stringify(missions, null, 2)).catch(() => {});

function deriveNode(node: AutonomousNode, mission: AutonomousMission): AutonomousNode {
  if (node.state === 'completed' || node.state === 'cancelled' || node.state === 'checkpointed') return node;
  const dependenciesDone = node.dependencies.every((id) => mission.nodes.find((candidate) => candidate.id === id)?.state === 'completed');
  if (!dependenciesDone) return { ...node, state: 'blocked' };
  return { ...node, state: node.requiresApproval && !node.approvedAt ? 'awaiting_approval' : 'ready' };
}

class AutonomousCoreService {
  async initialize(): Promise<void> {
    if (initialized) return;
    initialized = true;
    try {
      const info = await storageService.getInfo(FILE);
      if (info.exists) {
        const parsed = JSON.parse(await storageService.readAsString(FILE)) as AutonomousMission[];
        missions = parsed.map((mission) => ({
          ...mission,
          state: mission.state === 'active' ? 'paused' : mission.state,
          nodes: mission.nodes.map((node) => node.state === 'running'
            ? { ...node, state: 'checkpointed', checkpoint: node.checkpoint || { timestamp: Date.now() } }
            : node),
        }));
      }
    } catch {
      missions = [];
    }
    emit();
  }

  create(input: {
    title: string;
    objective: string;
    nodes: { id: string; label: string; agent: OperationAgent; dependencies?: string[]; requiresApproval?: boolean; risk?: AutonomousNode['risk'] }[];
    maxParallel?: number;
    maxAttempts?: number;
  }): AutonomousMission {
    const now = Date.now();
    const mission: AutonomousMission = {
      id: `mission-${now}-${Math.random().toString(36).slice(2, 7)}`,
      title: input.title,
      objective: input.objective,
      state: 'active',
      createdAt: now,
      updatedAt: now,
      budget: { maxParallel: Math.max(1, Math.min(6, input.maxParallel ?? 3)), maxAttempts: input.maxAttempts ?? 2 },
      nodes: input.nodes.map((node) => ({
        ...node,
        dependencies: node.dependencies || [],
        state: node.dependencies?.length ? 'blocked' : node.requiresApproval ? 'awaiting_approval' : 'ready',
        progress: 0,
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 2,
      })),
    };
    missions = [mission, ...missions].slice(0, 50);
    emit(); void persist();
    return mission;
  }

  checkpoint(missionId: string, nodeId: string, progress: number, payload?: unknown): void {
    this.updateMission(missionId, (mission) => ({ ...mission, nodes: mission.nodes.map((node) => node.id === nodeId ? {
      ...node, state: 'checkpointed', progress: Math.max(0, Math.min(99, progress)), checkpoint: { timestamp: Date.now(), payload },
    } : node) }));
  }

  approve(missionId: string, nodeId: string): void {
    this.updateMission(missionId, (mission) => ({ ...mission, state: 'active', nodes: mission.nodes.map((node) => node.id === nodeId && node.state === 'awaiting_approval' ? { ...node, state: 'ready', approvedAt: Date.now() } : node) }));
  }

  pause(missionId: string): void { this.updateMission(missionId, (mission) => ({ ...mission, state: 'paused' })); }
  resume(missionId: string): void { this.updateMission(missionId, (mission) => ({ ...mission, state: 'active' })); }
  cancel(missionId: string): void { this.updateMission(missionId, (mission) => ({ ...mission, state: 'cancelled', nodes: mission.nodes.map((node) => node.state === 'completed' ? node : { ...node, state: 'cancelled' }) })); }

  /** Runs every dependency-ready node in bounded parallel batches. Executors
   * are supplied at runtime; only serializable checkpoints survive restarts. */
  async runReady(
    missionId: string,
    executor: (node: AutonomousNode, checkpoint?: unknown) => Promise<string>
  ): Promise<void> {
    const mission = missions.find((item) => item.id === missionId);
    if (!mission || mission.state !== 'active') return;
    const normalized = { ...mission, nodes: mission.nodes.map((node) => deriveNode(node, mission)) };
    this.replace(normalized);
    const ready = normalized.nodes.filter((node) => node.state === 'ready' || node.state === 'checkpointed').slice(0, normalized.budget.maxParallel);
    await Promise.all(ready.map(async (node) => {
      this.patchNode(missionId, node.id, { state: 'running', attempts: node.attempts + 1 });
      try {
        const result = await executor(node, node.checkpoint?.payload);
        this.patchNode(missionId, node.id, { state: 'completed', progress: 100, result, error: undefined });
      } catch (error) {
        const attempts = node.attempts + 1;
        this.patchNode(missionId, node.id, {
          state: attempts < node.maxAttempts ? 'checkpointed' : 'failed', attempts,
          error: error instanceof Error ? error.message : String(error),
          checkpoint: { timestamp: Date.now(), payload: node.checkpoint?.payload },
        });
      }
    }));
    const current = missions.find((item) => item.id === missionId);
    if (!current) return;
    const nextNodes = current.nodes.map((node) => deriveNode(node, current));
    const failed = nextNodes.some((node) => node.state === 'failed');
    const awaiting = nextNodes.some((node) => node.state === 'awaiting_approval');
    const complete = nextNodes.every((node) => node.state === 'completed');
    this.updateMission(missionId, (value) => ({ ...value, nodes: nextNodes, state: complete ? 'completed' : failed ? 'failed' : awaiting ? 'awaiting_approval' : value.state }));
  }

  getSnapshot = (): AutonomousMission[] => missions;
  subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener); };

  private patchNode(missionId: string, nodeId: string, patch: Partial<AutonomousNode>): void {
    this.updateMission(missionId, (mission) => ({ ...mission, nodes: mission.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node) }));
  }
  private updateMission(id: string, apply: (mission: AutonomousMission) => AutonomousMission): void {
    missions = missions.map((mission) => mission.id === id ? { ...apply(mission), updatedAt: Date.now() } : mission);
    emit(); void persist();
  }
  private replace(mission: AutonomousMission): void {
    missions = missions.map((item) => item.id === mission.id ? mission : item); emit(); void persist();
  }
}

export const autonomousCoreService = new AutonomousCoreService();
export const useAutonomousMissions = (): AutonomousMission[] => useSyncExternalStore(autonomousCoreService.subscribe, autonomousCoreService.getSnapshot, autonomousCoreService.getSnapshot);
