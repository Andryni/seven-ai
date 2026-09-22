import React from 'react';
import { Platform } from 'react-native';

interface WebEnterSubmitProps {
  onSubmit: () => void;
  children: React.ReactNode;
}

/**
 * Web-only helper: forwards the Enter key (without Shift) from any wrapped
 * input to `onSubmit`. react-native-web renders multiline TextInputs as
 * <textarea>, whose onSubmitEditing never fires — so pressing Enter did
 * nothing in the browser. `display: contents` keeps the layout untouched and
 * lets keydown events from the inner textarea bubble to this div.
 * Native platforms pass children through unchanged.
 */
export const WebEnterSubmit: React.FC<WebEnterSubmitProps> = ({ onSubmit, children }) => {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }
  return (
    <div
      style={{ display: 'contents' }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
    >
      {children}
    </div>
  );
};
