import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
// SDK 57: the classic callback-style API moved to the 'legacy' subpath.
import * as FileSystem from 'expo-file-system/legacy';
import {
  AssistantConfig,
  AssistantStatus,
  ChatMessage,
  ChatSession,
  TerminalLogEntry,
  OrganizeResult,
  DaveProject,
  PatchLog,
  GoogleWorkspaceState,
  InstagramState,
  ResearchDocument,
  AutomationRoutine,
} from '../types';
import { JARVIS_VOICE_MODELS, fishVoiceFor } from '../services/fishAudioService';

interface SevenState {
  config: AssistantConfig;
  status: AssistantStatus;
  audioAmplitude: number;
  chatHistory: ChatMessage[];
  chatSessions: ChatSession[];
  /** Id of the session mirroring the live chatHistory, if any. */
  activeChatSessionId: string | null;
  terminalLogs: TerminalLogEntry[];
  lastOrganizeResult: OrganizeResult | null;
  daveProjects: DaveProject[];
  activeDaveProject: DaveProject | null;
  patchLogs: PatchLog[];
  googleState: GoogleWorkspaceState;
  instagramState: InstagramState;
  researchDocs: ResearchDocument[];
  automationRoutines: AutomationRoutine[];
  isInitialized: boolean;

  // Actions
  setConfig: (config: Partial<AssistantConfig>) => Promise<void>;
  loadSavedConfig: () => Promise<void>;
  setStatus: (status: AssistantStatus) => void;
  setAudioAmplitude: (amp: number) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => ChatMessage;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearChat: () => void;
  /** Wipes the conversation and returns to a fresh greeting (multi-turn memory reset). */
  resetConversation: () => void;
  /** Archives the current conversation and starts a fresh one. */
  startNewSession: () => void;
  /** Loads a past session back into the live chat (from the archive). */
  openChatSession: (sessionId: string) => void;
  /** Removes one archived session. */
  deleteChatSession: (sessionId: string) => void;
  /** Updates the title of an archived session. */
  renameChatSession: (sessionId: string, title: string) => void;
  togglePinChatSession: (sessionId: string) => void;
  /** Permanently clears every archived session. */
  clearChatSessions: () => void;
  addTerminalLog: (text: string, type?: TerminalLogEntry['type']) => void;
  clearTerminalLogs: () => void;
  setOrganizeResult: (result: OrganizeResult | null) => void;
  addDaveProject: (project: DaveProject) => void;
  /** Replaces a stored Dave project (used by iterative refinement). */
  updateDaveProject: (projectId: string, updates: Partial<DaveProject>) => void;
  setActiveDaveProject: (project: DaveProject | null) => void;
  addPatchLog: (patch: PatchLog) => void;
  updateGoogleState: (updates: Partial<GoogleWorkspaceState>) => void;
  updateInstagramState: (updates: Partial<InstagramState>) => void;
  addResearchDoc: (doc: ResearchDocument) => void;
  addAutomationRoutine: (routine: AutomationRoutine) => void;
  updateAutomationRoutine: (id: string, updates: Partial<AutomationRoutine>) => void;
  deleteAutomationRoutine: (id: string) => void;
}

const SECURE_STORE_KEY = 'seven_assistant_config_v3';

// Storage paths for JSON state persistence in the app sandbox.
// FileSystem.documentDirectory is null on web; keep this safe.
const DATA_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}seven_state/` : '';
const getSlicePath = (name: string) => `${DATA_DIR}${name}.json`;

const defaultConfig: AssistantConfig = {
  assistantName: 'Seven AI',
  userName: 'Commander',
  // Real-briefing default: any city name works, it is resolved via Open-Meteo.
  city: 'Antananarivo',
  geminiApiKey: '',
  openRouterKey: '',
  googleClientId: '',
  themeColor: '#00E5FF',
  theme: 'seven',
  uiMode: 'dark',
  language: 'en',
  memoryNotes: '',
  morningBriefingEnabled: false,
  systemPrompt:
    'You are Seven AI (SEVEN), an ultra-intelligent, sharp, elegant JARVIS-like AI assistant running on Android. You have full command over file organization, modern web synthesis (Dave Agent), code self-healing, and executive research.',
  voiceEnabled: true,
  voicePitch: 1.0,
  voiceRate: 1.0,
  voiceLanguage: 'en-US',
  voiceEngine: 'fish',
  // Fish Audio is the neural voice; the JARVIS models ship as defaults so the
  // engine is usable the moment a key is pasted.
  fishAudioApiKey: '',
  fishVoiceIdEn: JARVIS_VOICE_MODELS.en.id,
  fishVoiceIdFr: JARVIS_VOICE_MODELS.fr.id,
  elevenLabsApiKey: '',
  elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Default Rachel / Clear voice
  avatarStyle: 'gideon',
  wakeWordEnabled: false,
  gyroEnabled: true,
  showIconLabels: false,
  reduceMotion: 'auto',
  appLockEnabled: false,
  isConfigured: false,
};

const defaultGoogleState: GoogleWorkspaceState = {
  connected: false,
  unreadEmailsCount: 0,
  recentEmails: [],
  upcomingEventsCount: 0,
  upcomingEvents: [],
  driveFilesCount: 0,
  recentDriveFiles: [],
};

const defaultInstagramState: InstagramState = {
  connected: false,
  username: undefined,
  unreadDmsCount: 0,
  sessionActive: false,
  recentChats: [],
};

const initialChatHistory: ChatMessage[] = [
  {
    id: 'msg-init-1',
    sender: 'seven',
    text: 'Systems online. Seven AI neural core active. All orbital HUD rings calibrated. What is your command, Commander?',
    timestamp: Date.now() - 60000,
    terminalLogs: [
      'INIT: Seven AI Neural Core v3.1.0',
      'SYSTEM: Calibrating Orbital HUD Array [OK]',
      'AUDIO: Neural speech synthesizer & multi-lang DSP online [OK]',
      'STORAGE: SAF & Document Sandbox mounted [OK]',
    ],
  },
];

const initialTerminalLogs: TerminalLogEntry[] = [
  {
    id: 'log-1',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    text: 'SYSTEM INITIALIZED: SEVEN Android Core',
    type: 'info',
  },
  {
    id: 'log-2',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    text: 'Mounting Neural Acceleration Context...',
    type: 'cmd',
  },
  {
    id: 'log-3',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    text: 'Quantum state synchronized. Ready for directives.',
    type: 'success',
  },
];

const WEB_STORAGE_PREFIX = 'SEVEN_STATE_V3_';

const persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};
function persistSlice(name: string, data: unknown, debounceMs = 0) {
  const doWrite = () => {
    delete persistTimers[name];
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(WEB_STORAGE_PREFIX + name, JSON.stringify(data));
        }
      } catch (e) {
        console.warn(`[SEVEN store] LocalStorage write failed for ${name}:`, e);
      }
      return;
    }
    if (!DATA_DIR) return;
    (async () => {
      try {
        const dirInfo = await FileSystem.getInfoAsync(DATA_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true });
        }
        await FileSystem.writeAsStringAsync(getSlicePath(name), JSON.stringify(data));
      } catch (e) {
        console.warn(`[SEVEN store] Failed to persist ${name}:`, e);
      }
    })();
  };

  if (debounceMs <= 0) {
    doWrite();
  } else {
    if (persistTimers[name]) clearTimeout(persistTimers[name]);
    persistTimers[name] = setTimeout(doWrite, debounceMs);
  }
}

async function readPersistedSlice<T>(name: string, fallback: T): Promise<T> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(WEB_STORAGE_PREFIX + name);
        if (raw) return JSON.parse(raw);
      }
    } catch {
      // Fallback
    }
    return fallback;
  }
  if (!DATA_DIR) return fallback;
  try {
    const file = getSlicePath(name);
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists) return fallback;
    const content = await FileSystem.readAsStringAsync(file);
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

export const useSevenStore = create<SevenState>((set, get) => ({
  config: defaultConfig,
  status: 'idle',
  audioAmplitude: 0,
  chatHistory: initialChatHistory,
  chatSessions: [],
  activeChatSessionId: null,
  terminalLogs: initialTerminalLogs,
  lastOrganizeResult: null,
  daveProjects: [],
  activeDaveProject: null,
  patchLogs: [],
  googleState: defaultGoogleState,
  instagramState: defaultInstagramState,
  researchDocs: [],
  automationRoutines: [],
  isInitialized: false,

  setConfig: async (updates) => {
    const current = get().config;
    const updated = { ...current, ...updates };

    // Auto-sync voice language if UI language changed and voice language was not explicitly changed
    if (updates.language && !updates.voiceLanguage) {
      updated.voiceLanguage = updates.language === 'fr' ? 'fr-FR' : 'en-US';
    }

    // The neural voice is per-language: a French reply read by an English model
    // sounds like a tourist, so switching the spoken language re-points the
    // Fish voice unless the user pinned a custom one for that language.
    if (updates.voiceLanguage && updated.voiceEngine === 'fish' && !updates.fishVoiceIdFr && !updates.fishVoiceIdEn) {
      const wanted = fishVoiceFor(updates.voiceLanguage);
      const isFrench = updates.voiceLanguage.toLowerCase().startsWith('fr');
      const custom = isFrench ? updated.fishVoiceIdFr : updated.fishVoiceIdEn;
      if (!custom || Object.values(JARVIS_VOICE_MODELS).some((v) => v.id === custom)) {
        if (isFrench) updated.fishVoiceIdFr = wanted;
        else updated.fishVoiceIdEn = wanted;
      }
    }

    set({ config: updated });

    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('seven_config_web', JSON.stringify(updated));
        }
      } else {
        await SecureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('Failed to save config to SecureStore:', e);
    }
  },

  loadSavedConfig: async () => {
    try {
      let saved: string | null = null;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          saved = window.localStorage.getItem('seven_config_web');
        }
      } else {
        saved = await SecureStore.getItemAsync(SECURE_STORE_KEY);
      }

      const parsedConfig = saved ? JSON.parse(saved) : {};
      const config = { ...defaultConfig, ...parsedConfig };

      // Migration: Gideon replaced the original orb engines, so configs saved
      // with 'vector' / 'shader' are silently upgraded instead of leaving the
      // user stuck on a retired avatar.
      if (config.avatarStyle !== 'gideon') {
        config.avatarStyle = 'gideon';
      }

      const [
        chatHistory,
        chatSessions,
        activeChatSessionId,
        terminalLogs,
        daveProjects,
        patchLogs,
        researchDocs,
        automationRoutines,
      ] = await Promise.all([
        readPersistedSlice<ChatMessage[]>('chatHistory', initialChatHistory),
        readPersistedSlice<ChatSession[]>('chatSessions', []),
        readPersistedSlice<string | null>('activeChatSessionId', null),
        readPersistedSlice<TerminalLogEntry[]>('terminalLogs', initialTerminalLogs),
        readPersistedSlice<DaveProject[]>('daveProjects', []),
        readPersistedSlice<PatchLog[]>('patchLogs', []),
        readPersistedSlice<ResearchDocument[]>('researchDocs', []),
        readPersistedSlice<AutomationRoutine[]>('automationRoutines', []),
      ]);

      const activeDave = daveProjects.length > 0 ? daveProjects[0] : null;

      // Sanitize restored history: drop stale assistant placeholder bubbles
      // (empty or tool-marker-only) left behind by an interrupted turn. A
      // crash/reload mid-stream would otherwise show a ghost "PROCESSING…"
      // bubble forever. Always keep at least the greeting.
      const sanitizedHistory = chatHistory.filter(
        (m) =>
          m.sender === 'user' ||
          m.sender === 'system' ||
          m.text.replace(/\u27e8[^\u27e9]*\u27e9/g, '').trim().length > 0
      );
      const finalHistory =
        sanitizedHistory.length > 0 ? sanitizedHistory : initialChatHistory;

      set({
        config,
        chatHistory: finalHistory,
        chatSessions,
        activeChatSessionId,
        terminalLogs: terminalLogs.length > 0 ? terminalLogs : initialTerminalLogs,
        daveProjects,
        activeDaveProject: activeDave,
        patchLogs,
        researchDocs,
        automationRoutines,
        isInitialized: true,
      });
    } catch (e) {
      console.warn('Failed to restore persisted SEVEN state:', e);
      set({ isInitialized: true });
    }
  },

  setStatus: (status) => set({ status }),
  setAudioAmplitude: (amp) => set({ audioAmplitude: Math.max(0, Math.min(1, amp)) }),

  addChatMessage: (msg) => {
    const newMessage: ChatMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };

    set((state) => {
      const chatHistory = [...state.chatHistory, newMessage];
      persistSlice('chatHistory', chatHistory, 800);

      const activeId = state.activeChatSessionId;
      let chatSessions = state.chatSessions;
      let newActiveId = activeId;

      if (!activeId) {
        if (msg.sender === 'user') {
          const sid = `sess-${Date.now()}`;
          const title = msg.text.trim().slice(0, 36) || 'New Conversation';
          const newSession: ChatSession = {
            id: sid,
            title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: chatHistory,
          };
          chatSessions = [newSession, ...chatSessions];
          newActiveId = sid;
          persistSlice('chatSessions', chatSessions);
          persistSlice('activeChatSessionId', newActiveId);
        }
      } else {
        chatSessions = chatSessions.map((s) =>
          s.id === activeId ? { ...s, messages: chatHistory, updatedAt: Date.now() } : s
        );
        persistSlice('chatSessions', chatSessions, 800);
      }

      return { chatHistory, chatSessions, activeChatSessionId: newActiveId };
    });

    return newMessage;
  },

  updateChatMessage: (id, updates) =>
    set((state) => {
      const chatHistory = state.chatHistory.map((m) => (m.id === id ? { ...m, ...updates } : m));
      persistSlice('chatHistory', chatHistory, 400);

      const activeId = state.activeChatSessionId;
      let chatSessions = state.chatSessions;
      if (activeId) {
        chatSessions = chatSessions.map((s) =>
          s.id === activeId ? { ...s, messages: chatHistory, updatedAt: Date.now() } : s
        );
        persistSlice('chatSessions', chatSessions, 400);
      }

      return { chatHistory, chatSessions };
    }),

  clearChat: () =>
    set(() => {
      persistSlice('chatHistory', []);
      return { chatHistory: [] };
    }),

  resetConversation: () =>
    set((state) => {
      const user = state.config.userName || 'Commander';
      const isFr = state.config.language === 'fr';
      const freshGreeting: ChatMessage[] = [
        {
          id: `msg-init-${Date.now()}`,
          sender: 'seven',
          text: isFr
            ? `Systèmes en ligne. Noyau neuronal Seven AI actif. Comment puis-je vous aider, ${user} ?`
            : `Systems online. Seven AI neural core active. What is your command, ${user}?`,
          timestamp: Date.now(),
          terminalLogs: [
            'RESET: Multi-turn conversational memory re-initialized',
            'SYSTEM: Seven AI ready for directives [OK]',
          ],
        },
      ];
      persistSlice('chatHistory', freshGreeting);
      persistSlice('activeChatSessionId', null);
      return { chatHistory: freshGreeting, activeChatSessionId: null };
    }),

  startNewSession: () => {
    const { chatHistory, chatSessions, activeChatSessionId } = get();

    let updatedSessions = chatSessions;
    if (activeChatSessionId) {
      updatedSessions = chatSessions.map((s) =>
        s.id === activeChatSessionId ? { ...s, messages: chatHistory, updatedAt: Date.now() } : s
      );
    } else {
      const firstUserMsg = chatHistory.find((m) => m.sender === 'user');
      if (firstUserMsg) {
        const sid = `sess-${Date.now()}`;
        const title = firstUserMsg.text.trim().slice(0, 36) || 'Conversation';
        const session: ChatSession = {
          id: sid,
          title,
          createdAt: chatHistory[0]?.timestamp || Date.now(),
          updatedAt: Date.now(),
          messages: chatHistory,
        };
        updatedSessions = [session, ...chatSessions];
      }
    }
    persistSlice('chatSessions', updatedSessions);

    const user = get().config.userName || 'Commander';
    const isFr = get().config.language === 'fr';
    const freshGreeting: ChatMessage[] = [
      {
        id: `msg-init-${Date.now()}`,
        sender: 'seven',
        text: isFr
          ? `Systèmes réinitialisés. Noyau Seven AI disponible. À vos ordres, ${user}.`
          : `Systems re-initialized. Seven AI ready. What is your command, ${user}?`,
        timestamp: Date.now(),
        terminalLogs: [
          'SESSION ARCHIVED: Stored in memory core',
          'NEW CONVERSATION: Memory context initialized',
        ],
      },
    ];
    persistSlice('chatHistory', freshGreeting);
    persistSlice('activeChatSessionId', null);

    set({
      chatSessions: updatedSessions,
      chatHistory: freshGreeting,
      activeChatSessionId: null,
    });
  },

  openChatSession: (sessionId) => {
    const session = get().chatSessions.find((s) => s.id === sessionId);
    if (!session) return;
    persistSlice('chatHistory', session.messages);
    persistSlice('activeChatSessionId', session.id);
    set({
      chatHistory: session.messages,
      activeChatSessionId: session.id,
    });
  },

  deleteChatSession: (sessionId) =>
    set((state) => {
      const chatSessions = state.chatSessions.filter((s) => s.id !== sessionId);
      persistSlice('chatSessions', chatSessions);
      const activeChatSessionId =
        state.activeChatSessionId === sessionId ? null : state.activeChatSessionId;
      if (activeChatSessionId !== state.activeChatSessionId) {
        persistSlice('activeChatSessionId', null);
      }
      return { chatSessions, activeChatSessionId };
    }),

  renameChatSession: (sessionId, title) =>
    set((state) => {
      const trimmed = title.trim();
      if (!trimmed) return {};
      const chatSessions = state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, title: trimmed } : s
      );
      persistSlice('chatSessions', chatSessions);
      return { chatSessions };
    }),

  togglePinChatSession: (sessionId) =>
    set((state) => {
      const chatSessions = state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, pinned: !s.pinned } : s
      );
      persistSlice('chatSessions', chatSessions);
      return { chatSessions };
    }),

  clearChatSessions: () => {
    persistSlice('chatSessions', []);
    persistSlice('activeChatSessionId', null);
    set({ chatSessions: [], activeChatSessionId: null });
  },

  addTerminalLog: (text, type = 'info') =>
    set((state) => {
      const newLog: TerminalLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        text,
        type,
      };
      const terminalLogs = [newLog, ...state.terminalLogs].slice(0, 150);
      persistSlice('terminalLogs', terminalLogs, 1500);
      return { terminalLogs };
    }),

  clearTerminalLogs: () =>
    set(() => {
      persistSlice('terminalLogs', []);
      return { terminalLogs: [] };
    }),

  setOrganizeResult: (result) => set({ lastOrganizeResult: result }),

  addDaveProject: (project) =>
    set((state) => {
      const daveProjects = [project, ...state.daveProjects.filter((p) => p.id !== project.id)].slice(0, 30);
      persistSlice('daveProjects', daveProjects);
      return { daveProjects, activeDaveProject: project };
    }),

  updateDaveProject: (projectId, updates) =>
    set((state) => {
      const exists = state.daveProjects.some((p) => p.id === projectId);
      const daveProjects = exists
        ? state.daveProjects.map((p) => (p.id === projectId ? { ...p, ...updates } : p))
        : [{ ...(updates as DaveProject), id: projectId }, ...state.daveProjects];
      persistSlice('daveProjects', daveProjects);
      const project = daveProjects.find((p) => p.id === projectId) || null;
      return { daveProjects, activeDaveProject: project };
    }),

  setActiveDaveProject: (project) => set({ activeDaveProject: project }),

  addPatchLog: (patch) =>
    set((state) => {
      const patchLogs = [patch, ...state.patchLogs.filter((p) => p.id !== patch.id)].slice(0, 50);
      persistSlice('patchLogs', patchLogs);
      return { patchLogs };
    }),

  updateGoogleState: (updates) =>
    set((state) => ({
      googleState: { ...state.googleState, ...updates },
    })),

  updateInstagramState: (updates) =>
    set((state) => ({
      instagramState: { ...state.instagramState, ...updates },
    })),

  addResearchDoc: (doc) =>
    set((state) => {
      const researchDocs = [doc, ...state.researchDocs.filter((d) => d.id !== doc.id)].slice(0, 20);
      persistSlice('researchDocs', researchDocs);
      return { researchDocs };
    }),

  addAutomationRoutine: (routine) =>
    set((state) => {
      const automationRoutines = [
        routine,
        ...state.automationRoutines.filter((r) => r.id !== routine.id),
      ];
      persistSlice('automationRoutines', automationRoutines);
      return { automationRoutines };
    }),

  updateAutomationRoutine: (id, updates) =>
    set((state) => {
      const automationRoutines = state.automationRoutines.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      );
      persistSlice('automationRoutines', automationRoutines);
      return { automationRoutines };
    }),

  deleteAutomationRoutine: (id) =>
    set((state) => {
      const automationRoutines = state.automationRoutines.filter((r) => r.id !== id);
      persistSlice('automationRoutines', automationRoutines);
      return { automationRoutines };
    }),
}));
