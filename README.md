# SEVEN (Seven AI)

[Privacy notes](./PRIVACY.md) · [Honesty matrix](#️-honesty-matrix--real-vs-simulated)

[![CI](https://github.com/Andryni/seven-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Andryni/seven-ai/actions/workflows/ci.yml)

> JARVIS-like personal AI assistant for Android built with React Native, **Expo SDK 57**, Expo Router and TypeScript.

## ⚠️ Honesty matrix — real vs. simulated

This README now reflects what the app ACTUALLY does (the previous one claimed Skia
shaders, real OAuth, DM scraping and self-healing that did not exist).

| Feature | Status |
|---|---|
| Gideon / HUD / Terminal UI | ✅ Volumetric SVG avatar with perspective and accelerometer parallax, contextual gaze, layered facial anatomy and EN/FR viseme lip-sync (jaw, lips, teeth and tongue). ElevenLabs playback uses the real decoder position/duration to prevent drift; system/Fish streaming retain the text-timed fallback. Settings exposes Performance/Balanced/High budgets plus parallax, expression, mouth and gaze calibration. This is GPU-composited 2.5D, not a falsely advertised photorealistic 3D mesh. |
| Chat + tool execution | ✅ Real via **Gemini function calling** when a Gemini API key is set; keyword fallback otherwise. **Streaming**: plain conversational answers stream token-by-token straight from `generateContentStream()` (real API streaming, not a post-hoc chunk replay) from the very first token; tool-calling turns detect the `functionCall` the moment it appears in the stream, then phrase the final answer around the tool result with real streaming too, with a buffered `generateContent()` retry if the stream itself errors mid-flight. **Multi-turn memory**: the agent replays the last exchanges as context, so follow-up questions work. **Director pipeline**: the model can chain up to 3 tool calls for multi-step requests ("research X then organize my files") |
| **Tool chains (Director pipeline)** | ✅ Real — after each tool result the model either answers or requests the next tool (max 3 steps) |
| File Organizer (preview/move/undo) | ✅ Builds a non-destructive move plan first, lets the user exclude individual files, then performs real moves with a JSON undo journal. Defaults to the app-private sandbox; on Android the user can select Downloads (or another directory) through scoped Storage Access Framework permission. No fake demo files or broad storage permission. |
| Dave Agent (web builder) | ✅ Real file generation; Gemini-powered when key is set, otherwise built-in templates. **Iterative refinement**: follow-up prompts ("make the title blue") rewrite the project in place (requires Gemini) |
| Research → PDF | ⚠️ Retrieves public evidence from optional **Brave Search** (when its API key is configured), then DuckDuckGo, Wikipedia and Crossref; constrains Gemini to those extracts, displays links and adds a PDF bibliography. This is a lightweight sourced synthesis, **not academic deep research**. If retrieval fails the PDF is explicitly marked unverified and no factual fallback is fabricated. |
| Document attachment | ✅ UTF-8 extraction for text/code/CSV/Markdown, local DOCX XML extraction, and native page-aware PDF analysis through Gemini inline data (10 MB PDF limit). A review card shows name, size and processing mode before anything is sent; the instruction remains editable. Unsupported binaries are rejected honestly. |
| JavaScript sandbox | ⚠️ Isolated, CSP-restricted disposable WebView on native. Disabled on Web because same-origin `new Function` cannot safely protect browser storage. |
| Text-to-speech | ✅ Real (`expo-speech`) with adjustable pitch / speed / language and a TEST button in Settings |
| Speech recognition | ⚠️ Real with `expo-speech-recognition` installed (dev client / production build); **labeled demo fallback** otherwise. In hands-free/voice mode, optional **barge-in** listens during TTS, rejects likely speaker echo, stops playback on the first real partial transcript, then sends the complete interruption. |
| Mic amplitude | ⚠️ Real via `expo-av` metering when recording permission is granted; simulated otherwise |
| Gmail | ✅ Real OAuth2 **PKCE** + Gmail API (read-only) — requires a Google Cloud OAuth Client ID |
| Instagram | ⚠️ Opens a real browser session only; **no public DM API exists** |
| Telemetry | ⚠️ CPU/RAM/latency simulated • **FPS real** (rAF-measured) • **Battery real** (expo-battery) • **Network real** (NetInfo) — simulated values tagged `[SIM]` in the HUD |
| Self-healing "AST hot-patch" | ⚠️ Failure **reporting** (records patch logs + Gemini fix suggestions); it does not modify running code |
| Morning briefing | ⚠️ Weather/battery are placeholders • ✅ **Daily 08:00 local notification** (expo-notifications, toggle in Settings) |
| **Automation routines** | ✅ Real, on-device automation engine with a draggable conditional graph, TRUE/FALSE branches and dry-run traces. Time triggers use OS notifications. Generation 4 also registers OS-budgeted maintenance through `expo-background-task`/WorkManager; Android decides the exact execution window, so this is durable periodic maintenance rather than falsely advertised continuous execution. |
| **Long-term memory** | ✅ Real — permanent notes (Settings) injected into every agent request. Separately, a dedicated **Memory screen** lists, searches, edits and deletes every individual fact the agent remembered via `remember_fact` (its own on-device JSON store, `memoryService`) — add one manually there too. "Forget everything" wipes both stores |
| **Theming & i18n** | ✅ 3 accent palettes × dark/light and a shared FR/EN dictionary across core navigation, chat, history, memory, routines, Organizer, Research, Settings and diagnostics. Product names and technical identifiers intentionally remain unchanged. |
| **Haptics & offline queue** | ✅ Haptic feedback on all key actions; commands typed offline are queued and flushed on reconnect |

## Generation 4 — Autonomous Core

The **Autonomous Core** dashboard adds persisted dependency-graph missions, bounded parallel specialist agents, restart-safe checkpoints, explicit high-risk approvals, local OpenAI-compatible inference, local multimodal OCR, proactive commitment/weather signals, isolated Personal/Work/Guest data profiles, prompt-injection scanning, byte-level SHA-256 duplicate confirmation, DAVE multi-runtime artifacts and review-only GitHub pull requests.

Optional multi-device synchronization uses a user-hosted endpoint. The complete snapshot is encrypted on-device with **XChaCha20-Poly1305** before upload; prompts, memory, projects and credentials are never sent to the sync server in plaintext. Remote imports require explicit confirmation and credentials remain in SecureStore rather than the synchronized snapshot.

Important platform boundaries remain explicit:

- WorkManager/background tasks are scheduled by Android and are not an unrestricted always-running process.
- Continuous background wake-word capture requires a dedicated foreground-service speech module and is not misrepresented as available.
- The built-in Gideon renderer is adaptive volumetric 2.5D; it falls back gracefully on low-end hardware instead of requiring a large third-party 3D facial asset.
- Local generative inference/OCR uses a user-configured on-device or LAN OpenAI-compatible runtime. Without one, SEVEN retains its deterministic extractive offline core.

## Test rapide avec Expo Go

```bash
npm install
npm run start:go          # même Wi-Fi : scanner le QR dans Expo Go
npm run start:go:tunnel   # réseaux différents : tunnel ngrok
```

Le bundle détecte désormais Expo Go avant d’évaluer les modules natifs optionnels. Les widgets Android, les quick actions, le partage entrant, les notifications, WorkManager et la reconnaissance vocale native sont remplacés par des adaptateurs sûrs au lieu de faire planter le routeur. Le dashboard affiche clairement **EXPO GO // COMPATIBILITY MODE**.

Disponibles dans Expo Go : interface complète, navigation, Gideon, chat Gemini/OpenRouter, capture audio avec transcription cloud, DAVE, recherche, mémoire, organiseur sandboxé, météo, missions au premier plan et synchronisation réseau. Nécessitent toujours le development build : wake word/reconnaissance native, tâches de fond, widgets, quick actions, notifications natives et partage depuis une autre application.

## Setup

```bash
npm install
npm run start:go
```

### Unlock the full experience

1. **Gemini API key** (chat intelligence + Dave AI synthesis + research content):
   get one at https://aistudio.google.com/app/apikey, enter it in Onboarding/Settings.
2. **Google OAuth Client ID** (real Gmail):
   create a *Web application* OAuth client in Google Cloud console and whitelist
   the redirect URI printed in the terminal when you press Connect.
   Scopes: `gmail.readonly` only.
3. **Speech recognition**: build a dev client (`npx expo run:android`) — Expo Go cannot include the native recognition module.
4. **Brave Search API key** (optional): enter one in Settings to add Brave results ahead of the keyless DuckDuckGo, Wikipedia and Crossref fallbacks.

### Secret storage and privacy

- Android/iOS persist each provider API key in its own operating-system secure-store entry. Non-secret preferences remain in a separate sanitized configuration record; legacy combined records are migrated automatically.
- The Web build deliberately keeps API keys **session-only**; browser `localStorage` is not a hardware keystore. Older persisted web keys are removed during migration.
- Prompts, selected document excerpts, tool results and configured memory may be sent over HTTPS to the selected AI provider. Do not enter sensitive data unless you accept that provider's privacy terms.
- To bound device storage, chat histories retain at most 300 messages, with at most 100 saved sessions and 100 automation routines. Settings shows live usage bars for all three limits.
- Settings provides explicit, user-triggered health checks for Gemini, OpenRouter and Brave, including status and latency. Provider credentials are never included in the result or logs.

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

CI runs typecheck, lint, Jest and Expo Web/Android exports. The separate `android-e2e.yml` workflow (weekly or manual) prebuilds Android, builds a debug APK and runs the Maestro smoke flow on an API 35 emulator. It validates an unsigned test build, not a store-signed release.

## Build production APK via EAS

```bash
npm install -g eas-cli       # or: npx eas-cli
npx eas-cli login
npx eas-cli build --platform android --profile preview   # installable APK
npx eas-cli build --platform android --profile production # AAB for Play Store
```
