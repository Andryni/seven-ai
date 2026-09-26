import React from 'react';
import { isExpoGo } from './notificationsAdapter';
import type { ShareIntent } from 'expo-share-intent';

interface ShareIntentContextValue {
  hasShareIntent: boolean;
  shareIntent: ShareIntent | null;
  resetShareIntent: () => void;
}

const fallback: ShareIntentContextValue = {
  hasShareIntent: false,
  shareIntent: null,
  resetShareIntent: () => {},
};

let nativeModule: any = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require('expo-share-intent');
  } catch {
    nativeModule = null;
  }
}

const nativeHook = nativeModule?.useShareIntentContext as (() => ShareIntentContextValue) | undefined;
export const useShareIntentContext: () => ShareIntentContextValue = nativeHook || (() => fallback);

export const ShareIntentProvider: React.FC<{
  children: React.ReactNode;
  options?: { resetOnBackground?: boolean };
}> = nativeModule?.ShareIntentProvider || (({ children }: { children: React.ReactNode }) => <>{children}</>);

export const shareIntentSupported = !isExpoGo && !!nativeModule;
