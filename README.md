# SEVEN (Seven AI)

[![CI](https://github.com/Andryni/seven-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Andryni/seven-ai/actions/workflows/ci.yml)

> JARVIS-like personal AI assistant for Android built with React Native, **Expo SDK 57**, Expo Router and TypeScript.

## ⚠️ Honesty matrix — real vs. simulated

This README now reflects what the app ACTUALLY does (the previous one claimed Skia
shaders, real OAuth, DM scraping and self-healing that did not exist).

| Feature | Status |
|---|---|
| Orb / HUD / Terminal UI | ✅ Real (SVG + Animated; **not** Skia) |
| Chat + tool execution | ✅ Real via **Gemini function calling** when a Gemini API key is set; keyword fallback otherwise. **Streaming**: plain conversational answers stream token-by-token straight from `generateContentStream()` (real API streaming, not a post-hoc chunk replay) from the very first token; tool-calling turns detect the `functionCall` the moment it appears in the stream, then phrase the final answer around the tool result with real streaming too, with a buffered `generateContent()` retry if the stream itself errors mid-flight. **Multi-turn memory**: the agent replays the last exchanges as context, so follow-up questions work. **Director pipeline**: the model can chain up to 3 tool calls for multi-step requests ("research X then organize my files") |
| **Tool chains (Director pipeline)** | ✅ Real — after each tool result the model either answers or requests the next tool (max 3 steps) |
| File Organizer (scan/move/undo) | ✅ Real, on the app sandbox (`FileSystem.documentDirectory/Downloads/`), with JSON undo journal |
| Dave Agent (web builder) | ✅ Real file generation; Gemini-powered when key is set, otherwise built-in templates. **Iterative refinement**: follow-up prompts ("make the title blue") rewrite the project in place (requires Gemini) |
| Research → PDF | ✅ Real via `expo-print`, with **clickable table of contents** (anchor links), one page per section, and HTML-escaped content |
| Text-to-speech | ✅ Real (`expo-speech`) with adjustable pitch / speed / language and a TEST button in Settings |
| Speech recognition | ⚠️ Real with `expo-speech-recognition` installed (dev client / production build); **labeled demo fallback** otherwise. In hands-free/voice mode, optional **barge-in** listens during TTS, rejects likely speaker echo, stops playback on the first real partial transcript, then sends the complete interruption. |
| Mic amplitude | ⚠️ Real via `expo-av` metering when recording permission is granted; simulated otherwise |
| Gmail | ✅ Real OAuth2 **PKCE** + Gmail API (read-only) — requires a Google Cloud OAuth Client ID |
| Instagram | ⚠️ Opens a real browser session only; **no public DM API exists** |
| Telemetry | ⚠️ CPU/RAM/latency simulated • **FPS real** (rAF-measured) • **Battery real** (expo-battery) • **Network real** (NetInfo) — simulated values tagged `[SIM]` in the HUD |
| Self-healing "AST hot-patch" | ⚠️ Failure **reporting** (records patch logs + Gemini fix suggestions); it does not modify running code |
| Morning briefing | ⚠️ Weather/battery are placeholders • ✅ **Daily 08:00 local notification** (expo-notifications, toggle in Settings) |
| **Automation routines** | ✅ Real, on-device automation engine (Routines screen). `daily`/`weekly`/`once` schedule a real OS local notification ahead of time via `expo-notifications`. `battery_low`/`calendar_soon`/`wifi_connect` are **live conditions checked only while the app is in the foreground** (no background-task infra exists in this app) — they fire an immediate real notification + run the action the moment the condition is met, or on returning to the foreground, never invisibly |
| **Long-term memory** | ✅ Real — permanent notes (Settings) injected into every agent request. Separately, a dedicated **Memory screen** lists, searches, edits and deletes every individual fact the agent remembered via `remember_fact` (its own on-device JSON store, `memoryService`) — add one manually there too. "Forget everything" wipes both stores |
| **Theming & i18n** | ✅ 3 accent palettes (Ultron/Crimson/Matrix) × dark/light, applied instantly; UI in **English & French** |
| **Haptics & offline queue** | ✅ Haptic feedback on all key actions; commands typed offline are queued and flushed on reconnect |

## Setup

```bash
npm install
npx expo start          # Expo Go: UI + most features work
```

### Unlock the full experience

1. **Gemini API key** (chat intelligence + Dave AI synthesis + research content):
   get one at https://aistudio.google.com/app/apikey, enter it in Onboarding/Settings.
2. **Google OAuth Client ID** (real Gmail):
   create a *Web application* OAuth client in Google Cloud console and whitelist
   the redirect URI printed in the terminal when you press Connect.
   Scopes: `gmail.readonly` only.
3. **Speech recognition** (optional): add `expo-speech-recognition` and build a
   dev client (`npx expo run:android`) — Expo Go cannot include it.

## Project structure

```
├── app/                    # Expo Router screens (dashboard, chat, organizer, dave, research, settings, onboarding)
├── src/
│   ├── components/         # OrbView, HudHeader, TerminalLog, WebViewPreview, modals...
│   ├── core/               # brahmaAgent (tool router + Director pipeline), daveAgent, selfHealing
│   ├── services/           # storage, fileOrganizer, gmail, instagram, research, soundFx, haptics, briefing notifications
│   ├── hooks/              # useVoice (TTS/STT/amplitude), useTelemetry
│   ├── store/              # Zustand store + file-based persistence
│   ├── theme/              # Design system: palettes (ultron/crimson/matrix × dark/light), useThemeStyles, i18n FR/EN
│   └── types/              # Shared TypeScript interfaces
├── .maestro/               # Maestro E2E smoke tests (npx maestro test .maestro/dashboard-smoke.yaml)
└── __tests__/              # Jest tests for storage & organizer
```

## Commands

```bash
npm start        # dev server
npm run android  # open on Android
npm test         # Jest (organizer + storage)
npm run lint     # ESLint
npm run typecheck
```

## Build production APK via EAS

```bash
npm install -g eas-cli       # or: npx eas-cli
npx eas-cli login
npx eas-cli build --platform android --profile preview   # installable APK
npx eas-cli build --platform android --profile production # AAB for Play Store
```
