import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import { autonomousCoreService } from './autonomousCoreService';
import { operationService } from './operationService';

export const AUTONOMY_BACKGROUND_TASK = 'seven-autonomous-maintenance-v1';
let expiryRequested = false;

if (!TaskManager.isTaskDefined(AUTONOMY_BACKGROUND_TASK)) {
  TaskManager.defineTask(AUTONOMY_BACKGROUND_TASK, async () => {
    try {
      expiryRequested = false;
      await Promise.all([autonomousCoreService.initialize(), operationService.initialize()]);
      // The OS grants a short, non-deterministic window. We preserve durable
      // state and notify the user rather than pretending a JS task can run forever.
      const paused = autonomousCoreService.getSnapshot().filter((mission) => mission.state === 'paused');
      if (paused.length && Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'SEVEN autonomous core',
            body: `${paused.length} mission${paused.length > 1 ? 's' : ''} ready to resume.`,
            data: { route: '/autonomy' },
          },
          trigger: null,
        });
      }
      return expiryRequested ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

class BackgroundAutonomyService {
  private expirationSubscription: { remove: () => void } | null = null;

  async setEnabled(enabled: boolean): Promise<{ enabled: boolean; status: string }> {
    if (Platform.OS === 'web') return { enabled: false, status: 'unsupported' };
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
    if (Platform.OS === 'web') return { available: false, registered: false };
    const [status, registered] = await Promise.all([
      BackgroundTask.getStatusAsync(),
      TaskManager.isTaskRegisteredAsync(AUTONOMY_BACKGROUND_TASK),
    ]);
    return { available: status === BackgroundTask.BackgroundTaskStatus.Available, registered };
  }

  async testNow(): Promise<boolean> {
    if (!__DEV__ || Platform.OS === 'web') return false;
    return BackgroundTask.triggerTaskWorkerForTestingAsync();
  }
}

export const backgroundAutonomyService = new BackgroundAutonomyService();
