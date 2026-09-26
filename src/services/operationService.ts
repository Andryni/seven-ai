import { useSyncExternalStore } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

export type OperationAgent = 'GIDEON' | 'ATHENA' | 'ARES' | 'DAVE' | 'HERMES' | 'JANUS';
export type OperationState = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface OperationStep {
  id: string;
  label: string;
  state: 'pending' | 'running' | 'completed' | 'failed';
  updatedAt: number;
}

export interface SevenOperation {
  id: string;
  kind: string;
  title: string;
  agent: OperationAgent;
  state: OperationState;
  progress: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  detail?: string;
  steps: OperationStep[];
}

const FILE = `${FileSystem.documentDirectory || ''}seven_operations.json`;
const MAX_OPERATIONS = 100;
const listeners = new Set<() => void>();
let operations: SevenOperation[] = [];
let initialized = false;
let initializePromise: Promise<void> | null = null;

const emit = () => listeners.forEach((listener) => listener());
const persist = () => FileSystem.writeAsStringAsync(FILE, JSON.stringify(operations)).catch(() => {});
const update = (id: string, apply: (operation: SevenOperation) => SevenOperation) => {
  operations = operations.map((operation) => operation.id === id ? apply(operation) : operation);
  emit();
  void persist();
};

export const operationService = {
  async initialize(): Promise<void> {
    if (initialized) return;
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      try {
        const info = await FileSystem.getInfoAsync(FILE);
        if (info.exists) {
          const parsed = JSON.parse(await FileSystem.readAsStringAsync(FILE)) as SevenOperation[];
          // A process died while these were running. Preserve the audit trail,
          // but report interruption honestly rather than pretending they still run.
          operations = parsed.map((operation) =>
            operation.state === 'running' || operation.state === 'queued'
              ? { ...operation, state: 'paused', detail: 'Interrupted by application restart', updatedAt: Date.now() }
              : operation
          );
        }
      } catch {
        operations = [];
      }
      initialized = true;
      emit();
    })();
    return initializePromise;
  },

  begin(input: { kind: string; title: string; agent?: OperationAgent; steps?: string[] }): string {
    const now = Date.now();
    const id = `op_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const steps = (input.steps?.length ? input.steps : ['Understand', 'Execute', 'Verify', 'Report']).map((label, index) => ({
      id: `${id}_${index}`,
      label,
      state: index === 0 ? 'running' as const : 'pending' as const,
      updatedAt: now,
    }));
    operations = [{
      id,
      kind: input.kind,
      title: input.title,
      agent: input.agent || 'GIDEON',
      state: 'running' as const,
      progress: 4,
      createdAt: now,
      updatedAt: now,
      steps,
    }, ...operations].slice(0, MAX_OPERATIONS);
    emit();
    void persist();
    return id;
  },

  progress(id: string, progress: number, detail?: string, activeStep?: number): void {
    update(id, (operation) => operation.state !== 'running' && operation.state !== 'queued' ? operation : ({
      ...operation,
      state: 'running',
      progress: Math.max(0, Math.min(100, progress)),
      detail: detail ?? operation.detail,
      updatedAt: Date.now(),
      steps: operation.steps.map((step, index) => ({
        ...step,
        state: activeStep === undefined
          ? step.state
          : index < activeStep ? 'completed' : index === activeStep ? 'running' : 'pending',
        updatedAt: Date.now(),
      })),
    }));
  },

  assign(id: string, agent: OperationAgent): void {
    update(id, (operation) => ({ ...operation, agent, updatedAt: Date.now() }));
  },

  complete(id: string, detail?: string): void {
    update(id, (operation) => ({
      ...operation,
      state: 'completed',
      progress: 100,
      detail: detail ?? operation.detail,
      updatedAt: Date.now(),
      completedAt: Date.now(),
      steps: operation.steps.map((step) => ({ ...step, state: 'completed', updatedAt: Date.now() })),
    }));
  },

  fail(id: string, detail: string): void {
    update(id, (operation) => ({
      ...operation,
      state: 'failed',
      detail,
      updatedAt: Date.now(),
      completedAt: Date.now(),
      steps: operation.steps.map((step) => step.state === 'running' ? { ...step, state: 'failed', updatedAt: Date.now() } : step),
    }));
  },

  pause(id: string): void {
    update(id, (operation) => operation.state === 'running' || operation.state === 'queued'
      ? { ...operation, state: 'paused', detail: 'Paused by user', updatedAt: Date.now() }
      : operation);
  },

  resume(id: string): void {
    update(id, (operation) => operation.state === 'paused'
      ? { ...operation, state: 'running', detail: 'Resumed by user', updatedAt: Date.now() }
      : operation);
  },

  cancel(id: string): void {
    update(id, (operation) => ({ ...operation, state: 'cancelled', detail: 'Cancelled by user', updatedAt: Date.now(), completedAt: Date.now() }));
  },

  clearFinished(): void {
    operations = operations.filter((operation) => operation.state === 'running' || operation.state === 'queued' || operation.state === 'paused');
    emit();
    void persist();
  },

  getSnapshot: () => operations,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useOperations(): SevenOperation[] {
  return useSyncExternalStore(operationService.subscribe, operationService.getSnapshot, operationService.getSnapshot);
}

export function agentForTool(toolName?: string): OperationAgent {
  if (!toolName) return 'GIDEON';
  if (toolName === 'dave_build' || toolName === 'code_sandbox') return 'DAVE';
  if (toolName === 'research_pdf' || toolName === 'web_search' || toolName === 'live_info') return 'ATHENA';
  if (toolName === 'self_heal') return 'JANUS';
  if (toolName === 'gmail_read' || toolName === 'instagram_check' || toolName === 'device_action') return 'HERMES';
  if (toolName === 'organizer' || toolName === 'routine') return 'ARES';
  return 'GIDEON';
}
