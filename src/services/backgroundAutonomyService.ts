import { Platform } from 'react-native';
import type * as TaskManagerType from 'expo-task-manager';
import type * as BackgroundTaskType from 'expo-background-task';
import { autonomousCoreService } from './autonomousCoreService';
import { operationService } from './operationService';
import { getNotificationsModule, isExpoGo } from './notificationsAdapter';

export const AUTONOMY_BACKGROUND_TASK = 'seven-autonomous-maintenance-v1';
let expiryRequested = false;
let TaskManager: typeof TaskManagerType | null = null;
let BackgroundTask: typeof BackgroundTaskType | null = null;

if (Platform.OS !== 'web' && !isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    TaskManager = require('expo-task-manager');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    BackgroundTask = require('expo-background-task');
  } catch {
    TaskManager = null;
    BackgroundTask = null;
  }
}

if (TaskManager && BackgroundTask && !TaskManager.isTaskDefined(AUTONOMY_BACKGROUND_TASK)) {
  const backgroundModule = BackgroundTask;
  TaskManager.defineTask(AUTONOMY_BACKGROUND_TASK, async () => {
    try {
      expiryRequested = false;
      await Promise.all([autonomousCoreService.initialize(), operationService.initialize()]);
      const paused = autonomousCoreService.getSnapshot().filter((mission) => mission.state === 'paused');
      const notifications = getNotificationsModule();
      if (paused.length && notifications) {
        await notifications.scheduleNotificationAsync({
          content: {
            title: 'SEVEN autonomous core',
            body: `${paused.length} mission${paused.length > 1 ? 's' : ''} ready to resume.`,
            data: { route: '/autonomy' },
          },
          trigger: null,
        });
      }
      return expiryRequested ? backgroundModule.BackgroundTaskResult.Failed : backgroundModule.BackgroundTaskResult.Success;
    } catch {
      return backgroundModule.BackgroundTaskResult.Failed;
    }
  });
}

class BackgroundAutonomyService {
  private expirationSubscription: { remove: () => void } | null = null;

  isSupported(): boolean {
    return !!TaskManager && !!BackgroundTask;
  }

  async setEnabled(enabled: boolean): Promise<{ enabled: boolean; status: string }> {
    if (!TaskManager || !BackgroundTask) return { enabled: false, status: isExpoGo ? 'development-build-required' : 'unsupported' };
    if (!enabled) {
      await BackgroundTask.unregisterTaskAsync(AUTONOMY_BACKGROUND_TASK).catch(() => {});
      this.expirationSubscription?.remove();
      this.expirationSubscription = null;
      return { enabled: false, status: 'disabled' };
    }
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      return { enabled: false, status: String(status) };
    }
    await BackgroundTask.registerTaskAsync(AUTONOMY_BACKGROUND_TASK, { minimumInterval: 15 });
    this.expirationSubscription?.remove();
    this.expirationSubscription = BackgroundTask.addExpirationListener(() => { expiryRequested = true; });
    return { enabled: true, status: 'registered' };
  }

  async getStatus(): Promise<{ available: boolean; registered: boolean }> {
    if (!TaskManager || !BackgroundTask) return { available: false, registered: false };
    const [status, registered] = await Promise.all([
      BackgroundTask.getStatusAsync(),
      TaskManager.isTaskRegisteredAsync(AUTONOMY_BACKGROUND_TASK),
    ]);
    return { available: status === BackgroundTask.BackgroundTaskStatus.Available, registered };
  }

  async testNow(): Promise<boolean> {
    if (!__DEV__ || !BackgroundTask) return false;
    return BackgroundTask.triggerTaskWorkerForTestingAsync();
  }
}

export const backgroundAutonomyService = new BackgroundAutonomyService();
