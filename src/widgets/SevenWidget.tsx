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

/** Localized action labels. The widget renders inside Android's RemoteViews
 *  host, not the app's React tree, so it cannot pull the i18n dictionary or
 *  theme context — the language rides in as a prop instead. Mirrors the
 *  localized quick actions (quickActionsService). */
const ACTION_LABELS: Record<'fr' | 'en', { organize: string; briefing: string; research: string; build: string }> = {
  fr: {
    organize: 'Organiser les fichiers',
    briefing: 'Briefing du matin',
    research: 'Recherche → PDF',
    build: 'Créer un site',
  },
  en: {
    organize: 'Organize files',
    briefing: 'Morning briefing',
    research: 'Research → PDF',
    build: 'Build a website',
  },
};

export interface SevenWidgetProps {
  /** Assistant display name, from AssistantConfig.assistantName. */
  assistantName: string;
  /** One-line live status (e.g. "SYSTEMS NOMINAL" or an active tool name). */
  statusLine: string;
  /** Theme accent color (hex), matches the in-app selected theme. */
  accentColor: string;
  /** "18°C Overcast • Paris" (or an honest "unavailable" line) — same
   *  Open-Meteo source as the in-app morning briefing. Optional so the
   *  widget still renders (minus the glance row) if the caller doesn't
   *  have it yet. */
  weatherLine?: string;
  /** "14:30 • Team sync" — the next event on the device calendar today
   *  (or an honest "unavailable"/"no events" line). Optional, same reason
   *  as `weatherLine`. */
  nextEventLine?: string;
  /** UI language for the action labels (defaults to 'en'). */
  language?: 'fr' | 'en';
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

/** A single glance fact row (weather / next event) — a small accent dot plus
 *  a line of text, deep-linking into the morning briefing like the header's
 *  own status line does, since that's where the full detail lives. */
function GlanceRow({ text, accentColor }: { text: string; accentColor: string }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'seven://?briefing=1' }}
      style={{
        width: 'match_parent',
        height: 'wrap_content',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
      }}
    >
      <FlexWidget
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: accentColor as `#${string}`,
          marginRight: 8,
        }}
      />
      <TextWidget
        text={text}
        truncate="END"
        maxLines={1}
        style={{ fontSize: 11, color: '#C7DEE6' }}
      />
    </FlexWidget>
  );
}

export function SevenWidget({
  assistantName,
  statusLine,
  accentColor,
  weatherLine,
  nextEventLine,
  language = 'en',
}: SevenWidgetProps) {
  const labels = ACTION_LABELS[language];
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
          marginBottom: 8,
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

      <TextWidget text={statusLine} style={{ fontSize: 11, color: '#7FA6B3', marginBottom: 8 }} />

      {/* Glanceable live facts — the whole point of a home-screen widget
          over an icon shortcut: information visible without opening the
          app. Rendered only when the caller has them (both are optional so
          older/partial call sites still compile and render). */}
      {(weatherLine || nextEventLine) && (
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 'wrap_content',
            flexDirection: 'column',
            marginBottom: 8,
          }}
        >
          {weatherLine ? <GlanceRow text={weatherLine} accentColor={accentColor} /> : null}
          {nextEventLine ? <GlanceRow text={nextEventLine} accentColor={accentColor} /> : null}
        </FlexWidget>
      )}

      <ActionRow label={labels.organize} deepLink="seven://organizer" accentColor={accentColor} />
      <ActionRow label={labels.briefing} deepLink="seven://?briefing=1" accentColor={accentColor} />
      <ActionRow label={labels.research} deepLink="seven://research" accentColor={accentColor} />
      <ActionRow label={labels.build} deepLink="seven://dave" accentColor={accentColor} />
    </FlexWidget>
  );
}
