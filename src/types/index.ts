export type AssistantStatus =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'organizing'
  | 'building'
  | 'healing';

export interface AssistantConfig {
  assistantName: string;
  userName: string;
  /** City used for the real weather/news briefing (Open-Meteo, no API key). */
  city?: string;
  geminiApiKey: string;
  openRouterKey?: string;
  /** Google Cloud OAuth Client ID (Web application type) for real Gmail access. */
  googleClientId?: string;
  themeColor: string;
  /** Accent palette: gold/cyan (SEVEN), crimson or matrix. */
  theme?: 'seven' | 'ultron' | 'crimson' | 'matrix';
  /** Light / dark HUD mode. */
  uiMode?: 'dark' | 'light';
  /** UI language. */
  language?: 'fr' | 'en';
  /** Long-term memory notes injected into every agent request. */
  memoryNotes?: string;
  /** Send the morning briefing notification daily. */
  morningBriefingEnabled?: boolean;
  systemPrompt?: string;
  voiceEnabled: boolean;
  voicePitch: number;
  voiceRate: number;
  voiceLanguage?: string;
  /** `fish` is the neural engine (Jarvis voices); the others are fallbacks. */
  voiceEngine?: 'system' | 'fish' | 'elevenlabs';
  /** Fish Audio key — the neural voice (JARVIS FR/EN) uses this. */
  fishAudioApiKey?: string;
  /** Voice model ids per spoken language, so FR speaks French and EN English. */
  fishVoiceIdFr?: string;
  fishVoiceIdEn?: string;
  /** Legacy ElevenLabs credentials, kept so old configs still work. */
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  /** Gideon (holographic head) is the default engine; the others are legacy. */
  avatarStyle?: 'gideon' | 'vector' | 'shader';
  /** Dashboard module deck: position per widget id, as fractions (0–1) of the
      canvas travel range, so an arranged layout survives resize and rotation. */
  widgetLayout?: Record<string, { x: number; y: number }>;
  /** Module ids the user removed from the dashboard deck. */
  widgetHidden?: string[];
  wakeWordEnabled?: boolean;
  gyroEnabled?: boolean;
  /** Shows a small text caption under icon-only buttons across the app
      (chat header, history actions...) — helps both readability and
      accessibility for anyone unsure what a bare icon does. */
  showIconLabels?: boolean;
  isConfigured: boolean;
}

/**
 * An archived conversation. Sessions are created automatically on the first
 * user message of a conversation and kept up to date while it is active.
 */
export interface ChatSession {
  id: string;
  /** Derived from the first user message (editable via renameSession). */
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** Convenience count of user+assistant turns. */
  messageCount?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'seven' | 'system';
  text: string;
  timestamp: number;
  imageUri?: string;
  toolCall?: {
    name:
      | 'organizer'
      | 'dave_build'
      | 'gmail_read'
      | 'instagram_check'
      | 'research_pdf'
      | 'self_heal'
      | 'web_search'
      | 'device_action'
      | 'vision'
      | 'document_analyze'
      | 'memory'
      | 'code_sandbox'
      | 'routine';
    status: 'running' | 'completed' | 'failed';
    summary?: string;
    result?: unknown;
    previewUrl?: string;
    filePath?: string;
    projectId?: string;
    patchId?: string;
  };
  terminalLogs?: string[];
}

export interface TerminalLogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'cmd' | 'success' | 'warn' | 'error' | 'patch';
}

export type FileCategory =
  | 'Images'
  | 'Documents'
  | 'Installers'
  | 'Audio'
  | 'Video'
  | 'Code'
  | 'Others';

export interface OrganizeFile {
  id: string;
  name: string;
  originalPath: string;
  newPath: string;
  category: FileCategory;
  size: number;
  extension: string;
}

export interface OrganizeResult {
  id: string;
  timestamp: number;
  totalFiles: number;
  categories: Record<string, number>;
  files: OrganizeFile[];
  status: 'active' | 'undone';
  message: string;
}

export interface DaveProject {
  id: string;
  name: string;
  prompt: string;
  timestamp: number;
  files: {
    'index.html': string;
    'style.css': string;
    'script.js': string;
    [key: string]: string;
  };
  folderPath: string;
  previewHtml: string;
}

/** When the routine fires: a fixed daily time, a specific weekday+time, or a one-shot date. */
export type RoutineTriggerType = 'daily' | 'weekly' | 'once';

export interface RoutineTrigger {
  type: RoutineTriggerType;
  /** 0-23, local time. */
  hour: number;
  /** 0-59. */
  minute: number;
  /** 1 (Sunday) – 7 (Saturday), expo-notifications' weekday convention. Required for 'weekly'. */
  weekday?: number;
  /** ISO date (YYYY-MM-DD), required for 'once'. */
  date?: string;
}

/** What the routine actually does once it fires. Every action reuses an
    existing, already-real service — no simulated action exists here. */
export type RoutineActionType =
  | 'morning_briefing'
  | 'organize_files'
  | 'check_emails'
  | 'web_search'
  | 'reminder';

export interface RoutineAction {
  type: RoutineActionType;
  /** Free text for 'reminder', or the fixed query for 'web_search'. Unused by the other action types. */
  payload?: string;
}

export interface AutomationRoutine {
  id: string;
  name: string;
  trigger: RoutineTrigger;
  action: RoutineAction;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
}


export interface PatchLog {
  id: string;
  timestamp: number;
  targetFile: string;
  error: string;
  originalSnippet: string;
  fixedSnippet: string;
  status: 'applied' | 'verified' | 'rolled_back';
  engine: string;
  synthesizerOutput: string;
}

export interface GoogleWorkspaceState {
  connected: boolean;
  accountEmail?: string;
  accessToken?: string;
  lastSync?: number;
  unreadEmailsCount: number;
  recentEmails: { id: string; from: string; subject: string; snippet: string; date: string }[];
  // NOTE: Calendar & Drive are not implemented yet (no scopes requested).
  upcomingEventsCount: number;
  upcomingEvents: { id: string; title: string; time: string; location?: string }[];
  driveFilesCount: number;
  recentDriveFiles: { id: string; name: string; type: string; modifiedTime: string }[];
}

export interface InstagramState {
  connected: boolean;
  username?: string;
  lastSync?: number;
  unreadDmsCount: number;
  sessionActive: boolean;
  recentChats: { id: string; sender: string; message: string; time: string }[];
}

export interface ResearchDocument {
  id: string;
  topic: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  content: string;
  pdfUri: string;
  timestamp: number;
  fileSize?: number;
}
