'use no memo';
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

/**
 * Home-screen Android widget: a compact "SEVEN" status card with four
 * one-tap deep links into the app (organize downloads, morning briefing,
 * research → PDF, build a website). Mirrors the four Quick Actions already
 * registered in `quickActionsService` (long-press-the-icon shortcuts) so the
 * same four commands are reachable without unlocking to the home screen and
 * opening the app first — a home-screen widget, unlike an icon shortcut,
 * stays visible and glanceable.
 *
 * Each row uses the `OPEN_URI` special click action with the app's own
 * `seven://` deep link scheme (already declared as `"scheme": "seven"` in
 * app.json), which Expo Router resolves straight to the matching route —
 * no custom `WIDGET_CLICK` handling needed in the task handler for this.
 *
 * IMPORTANT constraints from react-native-android-widget: widgets are pure
 * functions rendering only the library's own primitives (`FlexWidget`,
 * `TextWidget`, ...), never hooks, never plain RN components (`View`,
 * `Text`). The `'use no memo'` pragma stops the React Compiler from
 * injecting hook calls into a function that must stay hook-free.
 */

export interface SevenWidgetProps {
  /** Assistant display name, from AssistantConfig.assistantName. */
  assistantName: string;
  /** One-line live status (e.g. "SYSTEMS NOMINAL" or an active tool name). */
  statusLine: string;
  /** Theme accent color (hex), matches the in-app selected theme. */
  accentColor: string;
}

const ROW_HEIGHT = 40;

function ActionRow({
  label,
  deepLink,
  accentColor,
}: {
  label: string;
  deepLink: string;
  accentColor: string;
}) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLink }}
      accessibilityLabel={label}
      style={{
        height: ROW_HEIGHT,
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        marginBottom: 6,
      }}
    >
      <FlexWidget
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: accentColor as `#${string}`,
          marginRight: 10,
        }}
      />
      <TextWidget text={label} style={{ fontSize: 13, color: '#EAF6FA' }} />
    </FlexWidget>
  );
}

export function SevenWidget({ assistantName, statusLine, accentColor }: SevenWidgetProps) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={`${assistantName} widget`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#0A0F14',
        borderRadius: 20,
        padding: 12,
      }}
    >
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'wrap_content',
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <FlexWidget
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: accentColor as `#${string}`,
            marginRight: 8,
          }}
        />
        <TextWidget text={assistantName.toUpperCase()} style={{ fontSize: 15, color: '#FFFFFF' }} />
      </FlexWidget>

      <TextWidget text={statusLine} style={{ fontSize: 11, color: '#7FA6B3', marginBottom: 10 }} />

      <ActionRow label="Organize downloads" deepLink="seven://organizer" accentColor={accentColor} />
      <ActionRow label="Morning briefing" deepLink="seven://?briefing=1" accentColor={accentColor} />
      <ActionRow label="Research → PDF" deepLink="seven://research" accentColor={accentColor} />
      <ActionRow label="Build a website" deepLink="seven://dave" accentColor={accentColor} />
    </FlexWidget>
  );
}
