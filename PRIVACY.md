# SEVEN AI — Privacy notes

_Last updated: 26 September 2026_

SEVEN AI is primarily an on-device application. This document describes the current codebase; a store-ready policy must also identify the publisher and provide a contact address before release.

## Stored on the device

The app stores preferences, conversations, memories, routines, generated projects, research reports and diagnostic reports in its private application storage. On Android/iOS, each provider API key is stored in a separate operating-system secure-store entry; the general configuration record is sanitized and contains no provider keys. Legacy combined records are migrated automatically. On Web, API keys are session-only and are not persisted to `localStorage`.

Chat histories are capped at 300 messages, saved sessions at 100, and automation routines at 100. These limits bound future growth; users can also delete individual conversations, memories and routines.

Deleting app data or uninstalling the app removes app-private data. Individual conversation, memory and routine deletion controls are also available in the app.

## Data sent to external providers

Only when the corresponding feature is used:

- Google Gemini or OpenRouter receives prompts, recent conversation context, configured memory and relevant tool results.
- Fish Audio or ElevenLabs receives text selected for neural speech synthesis.
- Google OAuth/Gmail receives OAuth requests and Gmail read-only API requests.
- Open-Meteo receives a city search and weather coordinates.
- Brave Search (only when its optional API key is configured), DuckDuckGo, Wikipedia and Crossref receive research/search queries.
- Public RSS publishers receive requests for news feeds.

Attached text documents and images may be included in an AI request after the user selects them. SEVEN AI does not operate a project-owned backend in this repository, but each external provider applies its own terms, logging and retention policy.

## Permissions

Microphone, speech recognition, camera/photos, contacts, calendar, notifications and biometrics are requested only for features that need them. Contacts and calendar data can be included in an AI tool result when the user asks the assistant to use that feature.

## Important limitations

- The organizer accesses an Android public directory only after the user explicitly grants scoped Storage Access Framework permission.
- PDF bytes selected by the user may be sent to Gemini for page-aware analysis; DOCX text is extracted locally before analysis.
- Diagnostic repair suggestions are not automatically applied to the running app.
- JavaScript execution is disabled in the Web build.

## Before public distribution

The publisher must add a support/privacy contact, hosting URL, applicable legal basis, retention periods, deletion-request process, age policy, and provider-specific disclosures required by Google Play and the Apple App Store.
