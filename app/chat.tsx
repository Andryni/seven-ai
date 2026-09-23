import React, { useState, useRef, useEffect } from 'react';
import { FONT } from '../src/theme/typography';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { ChatBubble } from '../src/components/ChatBubble';
import { WebEnterSubmit } from '../src/components/WebEnterSubmit';
import { TerminalLog } from '../src/components/TerminalLog';
import { OrbView } from '../src/components/OrbView';
import { VoiceModeOverlay } from '../src/components/VoiceModeOverlay';
import { SelfHealingModal } from '../src/components/SelfHealingModal';
import { BottomNav } from '../src/components/BottomNav';
import { TapScale } from '../src/components/TapScale';
import { IconCaption } from '../src/components/IconCaption';
import { useVoice } from '../src/hooks/useVoice';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { t } from '../src/theme/i18n';
import { haptics } from '../src/services/hapticsService';
import { sevenAgent } from '../src/core/sevenAgent';
import { selfHealing } from '../src/core/selfHealing';
import { researchService } from '../src/services/researchService';
import { chatExportService } from '../src/services/chatExportService';
import {
  Mic,
  MicOff,
  Send,
  ChevronLeft,
  Zap,
  Terminal,
  Volume2,
  VolumeX,
  Trash2,
  MessageSquarePlus,
  History,
  Camera,
  Image as ImageIcon,
  X,
  Headphones,
  Paperclip,
  Waves,
  Download,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useShareIntentContext } from 'expo-share-intent';
import { documentAnalysisService } from '../src/services/documentAnalysisService';
import { shareIntentService } from '../src/services/shareIntentService';

export default function ChatScreen() {
  const router = useRouter();
  const config = useSevenStore((s) => s.config);
  const setConfig = useSevenStore((s) => s.setConfig);
  const status = useSevenStore((s) => s.status);
  const audioAmplitude = useSevenStore((s) => s.audioAmplitude);
  const chatHistory = useSevenStore((s) => s.chatHistory);
  const addChatMessage = useSevenStore((s) => s.addChatMessage);
  const updateChatMessage = useSevenStore((s) => s.updateChatMessage);
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);
  const resetConversation = useSevenStore((s) => s.resetConversation);
  const clearChat = useSevenStore((s) => s.clearChat);

  const palette = useTheme();
  const styles = useThemeStyles(chatStyles);

  const [inputQuery, setInputQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showSelfHealingModal, setShowSelfHealingModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // Deep-link entry: /chat?voice=1 opens the immersive voice mode directly
  // (used by the dashboard voice button). Read at mount time.
  const params = useLocalSearchParams<{ voice?: string }>();
  const [voiceModeOpen, setVoiceModeOpen] = useState(params.voice === '1');
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const handledShareIntentRef = useRef<string | null>(null);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  // Gideon's face reacts to outcomes: a smile when an action lands, a
  // stiffening when the turn fails. Cleared on a timer so it stays a flash.
  const [mood, setMood] = useState<'happy' | 'alert' | null>(null);
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashMood = (next: 'happy' | 'alert', ms = 2200) => {
    setMood(next);
    if (moodTimer.current) clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => setMood(null), ms);
  };

  useEffect(
    () => () => {
      if (moodTimer.current) clearTimeout(moodTimer.current);
    },
    []
  );

  const scrollViewRef = useRef<FlatList>(null);
  const {
    isRecording,
    isSpeaking,
    isAudible,
    partialTranscript,
    spokenText,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    voiceMode,
  } = useVoice();

  useEffect(() => {
    if (scrollViewRef.current && chatHistory.length > 0) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [chatHistory]);


  const handlePickImage = async () => {
    haptics.light();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]?.base64) {
        const asset = result.assets[0];
        setSelectedImage({
          uri: asset.uri,
          base64: asset.base64!,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      }
    } catch (e) {
      console.warn('Error picking image:', e);
    }
  };

  const handleTakePhoto = async () => {
    haptics.light();
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]?.base64) {
        const asset = result.assets[0];
        setSelectedImage({
          uri: asset.uri,
          base64: asset.base64!,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      }
    } catch (e) {
      console.warn('Error taking photo:', e);
    }
  };

  const handlePickDocument = async () => {
    haptics.light();
    try {
      const doc = await documentAnalysisService.pickAndReadDocument();
      if (doc.success && doc.textSnippet) {
        const prompt = `Analyse et résume ce document "${doc.name}" :\n\n"""\n${doc.textSnippet}\n"""`;
        handleSend(prompt);
      }
    } catch (e) {
      console.warn('Error reading document:', e);
    }
  };

  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const handsFreeRef = useRef(false);

  useEffect(() => {
    handsFreeRef.current = handsFreeMode;
  }, [handsFreeMode]);

  // Processing flag mirrored for timers: by the time a delayed re-arm fires,
  // the render that scheduled it is long gone, so state would read stale.
  const isProcessingRef = useRef(false);
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  /**
   * Hands-free chain bookkeeping.
   *
   * `silent` counts consecutive capture closures with nothing heard (the user
   * walked away, or is thinking). After a few of them the auto-rearm pauses —
   * an open microphone is never left looping forever — and the next reply or
   * sent command resets it.
   */
  const handsFreeChain = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    silent: number;
  }>({ timer: null, silent: 0 });
  const SILENT_REARM_LIMIT = 3;

  const clearHandsFreeChain = () => {
    if (handsFreeChain.current.timer) {
      clearTimeout(handsFreeChain.current.timer);
      handsFreeChain.current.timer = null;
    }
  };

  // Leaving the screen must not leave a timer behind that reopens the
  // microphone on its own.
  useEffect(() => {
    // Refs survive across renders, so this captures the live chain object —
    // the lint heuristic about stale `.current` does not apply here.
    const chain = handsFreeChain;
    return () => {
      if (chain.current.timer) {
        clearTimeout(chain.current.timer);
        chain.current.timer = null;
      }
    };
  }, []);

  /**
   * Rearms the microphone after a delay so the conversation can continue
   * without touching the screen. Every path through the chain re-arms through
   * this same helper, so a declined request or a silent capture can never
   * leave it dead while the mode is on.
   */
  const triggerContinuousListen = (delayMs = 400) => {
    if (!handsFreeRef.current) return;
    clearHandsFreeChain();
    handsFreeChain.current.timer = setTimeout(() => {
      handsFreeChain.current.timer = null;
      if (!handsFreeRef.current || isProcessingRef.current) return;
      haptics.light();
      const accepted = startListening(
        (transcript) => {
          if (!transcript || !transcript.trim()) return;
          // Words arrived: the reply will re-arm the chain, so the silent
          // streak is forgiven.
          handsFreeChain.current.silent = 0;
          // Saying stop or pause deactivates hands-free mode (spoken in the
          // user's UI language).
          const lower = transcript.toLowerCase();
          if (
            lower.includes('stop') ||
            lower.includes('pause') ||
            lower.includes('arrête') ||
            lower.includes('tais-toi') ||
            lower.includes('quitte le mode')
          ) {
            setHandsFreeMode(false);
            speak(
              (config.language || 'en') === 'fr'
                ? 'Mode mains libres désactivé.'
                : 'Hands-free mode disabled.'
            );
            return;
          }
          handleSend(transcript);
        },
        {
          onClosed: () => {
            // Closed with nothing heard (silence timeout): keep the door open
            // for a few captures, then wait for the next interaction.
            handsFreeChain.current.silent += 1;
            if (handsFreeChain.current.silent <= SILENT_REARM_LIMIT) {
              triggerContinuousListen(900);
            }
          },
        }
      );
      if (!accepted) {
        // The wake word or another screen owns the microphone: retry shortly,
        // bounded the same way as a silent streak.
        handsFreeChain.current.silent += 1;
        if (handsFreeChain.current.silent <= SILENT_REARM_LIMIT) {
          triggerContinuousListen(1200);
        }
      }
    }, delayMs);
  };

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || inputQuery;
    const currentImage = selectedImage;
    if ((!query.trim() && !currentImage) || isProcessing) return;

    haptics.light();
    setInputQuery('');
    setSelectedImage(null);
    setIsProcessing(true);

    addChatMessage({
      sender: 'user',
      text: query || 'Analyse cette image',
      imageUri: currentImage?.uri,
    });

    // Progressive display: create the assistant placeholder immediately so the
    // catch block can fill it on failure (no ghost "PROCESSING…" bubble).
    const reply = addChatMessage({
      sender: 'seven',
      text: '',
    });

    try {
      let acc = '';

      const result = await sevenAgent.chatStream(
        query,
        (token) => {
          if (token) {
            acc += token;
            // Streamed tool markers ⟨…⟩ describe the action SEVEN is running.
            // Surface the most recent one so voice mode can animate it live.
            const markers = acc.match(/\u27e8[^\u27e9]*\u27e9/g);
            if (markers && markers.length) {
              const latest = markers[markers.length - 1].slice(1, -1).trim();
              if (latest) setCurrentAction(latest);
            }
            updateChatMessage(reply.id, { text: acc });
          }
        },
        currentImage || undefined
      );

      updateChatMessage(reply.id, {
        text: result.text,
        toolCall: result.toolCall,
        terminalLogs: result.terminalLogs,
      });

      // An action actually ran → Gideon smiles.
      if (result.toolCall) flashMood('happy');

      // Words made it through: a fresh silent streak starts here.
      handsFreeChain.current.silent = 0;
      if (config.voiceEnabled && !isSpeaking) {
        // The end of the reply is the cue to listen again — that is the whole
        // hands-free loop.
        speak(result.text, () => {
          if (handsFreeRef.current) triggerContinuousListen(600);
        });
      } else if (handsFreeRef.current) {
        // Voice off, or a turn is already audible: keep the conversation going
        // without speaking over anyone.
        triggerContinuousListen(1200);
      }
    } catch (e: any) {
      haptics.error();
      flashMood('alert');
      // Fill the pending placeholder bubble instead of appending a new one,
      // otherwise the "PROCESSING DIRECTIVE…" ghost stays forever.
      updateChatMessage(reply.id, {
        text:
          (config.language || 'en') === 'fr'
            ? `Erreur de commande : ${e?.message || e}. Le moteur de correctifs est actif.`
            : `Command error: ${e?.message || e}. Hot-patch engine active.`,
      });
      // A failed turn must not strand the mode: give it a moment, then listen
      // again (the success path arms its own chain through speak's onDone).
      if (handsFreeRef.current) triggerContinuousListen(1500);
    } finally {
      setIsProcessing(false);
      setCurrentAction(null);
    }
  };

  /**
   * Handles content shared into SEVEN from another app's "Share ->" menu
   * (text, a link, an image, or a document). The chat screen is the one
   * place this is consumed — the OS routes the share intent to whichever
   * screen is on top, and expo-router mounts this screen fresh each time,
   * so a ref (not state) tracks which intent instance was already
   * processed to survive re-renders without re-firing on the same share.
   */
  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;
    // Stable-ish fingerprint of "this" share: re-running the effect (e.g. a
    // parent re-render) must not re-send the same content twice.
    const fingerprint = JSON.stringify({
      text: shareIntent.text,
      webUrl: shareIntent.webUrl,
      files: shareIntent.files?.map((f) => f.path),
    });
    if (handledShareIntentRef.current === fingerprint) return;
    handledShareIntentRef.current = fingerprint;

    (async () => {
      const classified = shareIntentService.classify(shareIntent);

      if (classified.kind === 'image') {
        try {
          const base64 = await FileSystem.readAsStringAsync(classified.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setSelectedImage({ uri: classified.uri, base64, mimeType: classified.mimeType });
          if (classified.caption) setInputQuery(classified.caption);
        } catch (e) {
          console.warn('Error reading shared image:', e);
        }
      } else if (classified.kind !== 'empty') {
        if (classified.kind === 'document') {
          const { textSnippet, isBinary } = await shareIntentService.readDocumentText(classified);
          const prompt = shareIntentService.buildPrompt(
            { ...classified, textSnippet, isBinary },
            (config.language || 'en') === 'fr' ? 'fr' : 'en'
          );
          handleSend(prompt);
        } else {
          const prompt = shareIntentService.buildPrompt(classified, (config.language || 'en') === 'fr' ? 'fr' : 'en');
          handleSend(prompt);
        }
      }

      resetShareIntent();
    })();
    // handleSend/config.language intentionally omitted: this effect must
    // fire exactly once per distinct incoming share, keyed by the
    // fingerprint check above, not on every identity change of those values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  /**
   * The single place a microphone press lands, from the chat bar, from voice
   * mode and from the wake-word loop. It is wrapped so that a failure in any
   * engine surfaces as a line in the terminal log instead of as an uncaught
   * error escaping a press handler — which is what took the whole screen down
   * before, because React tears the tree out on an error it cannot attribute.
   */
  const handleMicToggle = () => {
    try {
      haptics.medium();
      if (isSpeaking) {
        stopSpeaking();
        return;
      }

      if (isRecording) {
        stopListening();
      } else {
        startListening((transcript) => {
          if (transcript && transcript.trim()) handleSend(transcript);
        });
      }
    } catch (e: any) {
      haptics.error();
      addTerminalLog(`MICROPHONE ERROR: ${e?.message || e}`, 'error');
      console.warn('Mic toggle failed:', e);
    }
  };

  const handleNewConversation = () => {
    haptics.medium();
    resetConversation();
  };

  const [exportingChat, setExportingChat] = useState(false);
  const handleExportChat = async () => {
    if (exportingChat || chatHistory.length === 0) return;
    haptics.medium();
    setExportingChat(true);
    try {
      const lang = (config.language || 'en') === 'fr' ? 'fr' : 'en';
      const title = chatExportService.deriveTitle(
        chatHistory,
        lang === 'fr' ? 'Conversation Seven AI' : 'Seven AI Conversation'
      );
      addTerminalLog('Exporting conversation to PDF...', 'cmd');
      const pdfUri = await chatExportService.exportToPdf(title, chatHistory, lang);
      addTerminalLog(`* Conversation PDF compiled: ${pdfUri}`, 'success');
      await chatExportService.shareFile(
        pdfUri,
        'application/pdf',
        lang === 'fr' ? 'Partager la conversation' : 'Share conversation'
      );
    } catch (e: any) {
      addTerminalLog(`EXPORT ERROR: ${e?.message || e}`, 'error');
    } finally {
      setExportingChat(false);
    }
  };

  const handleAction = async (actionType: string, payload?: any) => {
    switch (actionType) {
      case 'open_dave_preview':
      case 'open_browser':
        router.push('/dave');
        break;
      case 'undo_organize':
        handleSend('undo last organization');
        break;
      case 'open_pdf':
        if (payload?.filePath) {
          researchService.sharePdf(payload.filePath);
        } else {
          router.push('/research');
        }
        break;
      case 'inspect_patch':
        setShowSelfHealingModal(true);
        break;
      case 'open_routines':
        router.push('/routines');
        break;
      case 'open_memory':
        router.push('/memory');
        break;
    }
  };

  // Latest user utterance + latest SEVEN answer, for the immersive voice mode.
  // While the microphone is open the live transcription wins: showing only the
  // previous message made it look as though nothing was being heard at all.
  const lastUserText =
    [...chatHistory].reverse().find((m) => m.sender === 'user')?.text ?? '';
  const liveUserText = partialTranscript.trim() ? partialTranscript : lastUserText;
  const lastSevenText =
    [...chatHistory].reverse().find((m) => m.sender === 'seven' && m.text.trim().length > 0)
      ?.text ?? '';

  return (
    <ParticleBackground>
      <HudHeader />

      {/* Screen Sub-Header */}
      <ScreenReveal index={0} distance={10}>
      <View style={styles.chatNavHeader}>
        <TapScale
          scaleTo={0.92}
          style={styles.backBtn}
          accessibilityLabel={t('nav.dashboard', config.language)}
          onPress={() => router.push('/')}
        >
          <ChevronLeft size={16} color={palette.accent} />
          <Text style={styles.backBtnText}>{t('nav.dashboard', config.language)}</Text>
        </TapScale>

        <View style={styles.headerCenter}>
          <OrbView
            size={36}
            status={status}
            amplitude={audioAmplitude}
            themeColor={palette.accent}
            mood={mood}
          />
          <Text style={styles.headerTitle}>
            {voiceMode === 'demo' ? 'SEVEN CHAT [DEMO MIC]' : 'SEVEN CHAT TERMINAL'}
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <TapScale
            scaleTo={0.9}
            style={[styles.iconBtn, voiceModeOpen && { backgroundColor: palette.accent }]}
            accessibilityLabel={t('dash.voiceMode', config.language)}
            onPress={() => {
              haptics.medium();
              setVoiceModeOpen(true);
            }}
          >
            <Waves size={15} color={voiceModeOpen ? palette.bgDeep : palette.accent} />
            <IconCaption
              visible={config.showIconLabels}
              label={t('dash.voiceMode', config.language)}
              color={voiceModeOpen ? palette.bgDeep : palette.accent}
            />
          </TapScale>

          <TouchableOpacity
            style={[styles.iconBtn, handsFreeMode && { backgroundColor: palette.accent }]}
            accessibilityLabel={
              handsFreeMode
                ? (config.language || 'en') === 'fr'
                  ? 'Désactiver le mode mains libres'
                  : 'Disable hands-free mode'
                : (config.language || 'en') === 'fr'
                  ? 'Activer le mode mains libres'
                  : 'Enable hands-free mode'
            }
            onPress={() => {
              haptics.medium();
              const next = !handsFreeMode;
              setHandsFreeMode(next);
              if (next) {
                speak(
                  (config.language || 'en') === 'fr'
                    ? 'Mode conversation mains libres activé. Je vous écoute.'
                    : 'Hands-free conversation enabled. I am listening.'
                );
                // Tracked like every re-arm, so leaving the screen cancels it.
                triggerContinuousListen(2200);
              } else {
                clearHandsFreeChain();
                stopSpeaking();
                stopListening();
              }
            }}
          >
            <Headphones size={15} color={handsFreeMode ? palette.bgDeep : palette.accent} />
            <IconCaption
              visible={config.showIconLabels}
              label={handsFreeMode ? 'HANDS-FREE' : 'HANDS-FREE'}
              color={handsFreeMode ? palette.bgDeep : palette.accent}
            />
          </TouchableOpacity>

          <TapScale
            scaleTo={0.9}
            style={styles.iconBtn}
            accessibilityLabel={t('nav.history', config.language)}
            onPress={() => {
              haptics.light();
              router.push('/history');
            }}
          >
            <History size={15} color={palette.warning} />
            <IconCaption
              visible={config.showIconLabels}
              label={t('nav.history', config.language)}
              color={palette.warning}
            />
          </TapScale>

          <TapScale
            scaleTo={0.9}
            style={styles.iconBtn}
            accessibilityLabel={t('chat.exportPdf', config.language)}
            onPress={handleExportChat}
            disabled={exportingChat || chatHistory.length === 0}
          >
            <Download
              size={15}
              color={chatHistory.length === 0 ? palette.textFaint : palette.info}
            />
            <IconCaption
              visible={config.showIconLabels}
              label={t('chat.exportPdf', config.language)}
              color={chatHistory.length === 0 ? palette.textFaint : palette.info}
            />
          </TapScale>

          <TapScale
            scaleTo={0.9}
            style={styles.iconBtn}
            accessibilityLabel={config.voiceEnabled ? 'Mute voice' : 'Unmute voice'}
            onPress={() => {
              haptics.light();
              setConfig({ voiceEnabled: !config.voiceEnabled });
            }}
          >
            {config.voiceEnabled ? (
              <Volume2 size={15} color={palette.success} />
            ) : (
              <VolumeX size={15} color={palette.textFaint} />
            )}
            <IconCaption
              visible={config.showIconLabels}
              label={config.voiceEnabled ? 'MUTE' : 'UNMUTE'}
              color={config.voiceEnabled ? palette.success : palette.textFaint}
            />
          </TapScale>

          <TapScale
            scaleTo={0.9}
            style={styles.iconBtn}
            accessibilityLabel="Runtime log"
            onPress={() => {
              haptics.light();
              setShowTerminal((prev) => !prev);
            }}
          >
            <Terminal size={15} color={showTerminal ? palette.info : palette.accent} />
            <IconCaption
              visible={config.showIconLabels}
              label="LOG"
              color={showTerminal ? palette.info : palette.accent}
            />
          </TapScale>

          <TapScale
            scaleTo={0.9}
            style={[styles.iconBtn, styles.newChatBtn]}
            accessibilityLabel={t('chat.newConversation', config.language)}
            onPress={handleNewConversation}
          >
            <MessageSquarePlus size={15} color={palette.info} />
            <Text style={styles.newChatText}>{t('chat.newConversation', config.language)}</Text>
          </TapScale>

          <TapScale
            scaleTo={0.9}
            style={styles.iconBtn}
            accessibilityLabel="Clear chat"
            onPress={() => {
              haptics.medium();
              clearChat();
            }}
          >
            <Trash2 size={15} color={palette.error} />
            <IconCaption visible={config.showIconLabels} label="CLEAR" color={palette.error} />
          </TapScale>
        </View>
      </View>
      </ScreenReveal>

      {/* Optional Terminal Tray */}
      {showTerminal && (
        <View style={styles.terminalTray}>
          <TerminalLog maxHeight={140} title="SEVEN_OS // CHAT RUNTIME LOG" />
        </View>
      )}

      {/* Messages area — virtualized: a long-running conversation used to be
          a single ScrollView rendering every bubble at once, which got
          visibly slower to scroll/update the more history accumulated. */}
      <FlatList
        ref={scrollViewRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        data={chatHistory}
        keyExtractor={(msg) => msg.id}
        renderItem={({ item }) => <ChatBubble message={item} onAction={handleAction} />}
        onScrollToIndexFailed={() => {}}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={12}
        windowSize={10}
        initialNumToRender={16}
      />

      {/* Bottom Chat Bar */}
      <ScreenReveal index={1} distance={10}>
      <View style={styles.bottomBar}>
        {selectedImage && (
          <View style={styles.imagePreviewBar}>
            <Image source={{ uri: selectedImage.uri }} style={styles.imageThumbnail} />
            <Text style={styles.imagePreviewText} numberOfLines={1}>IMAGE READY FOR ANALYSIS</Text>
            <TouchableOpacity
              style={styles.clearImageBtn}
              accessibilityLabel={t('input.clearImage', config.language)}
              onPress={() => setSelectedImage(null)}
            >
              <X size={14} color={palette.error} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputWrapper}>
          <TouchableOpacity
            style={styles.mediaBtn}
            accessibilityLabel={t('input.attachImage', config.language)}
            onPress={handlePickImage}
          >
            <ImageIcon size={16} color={palette.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mediaBtn}
            accessibilityLabel={t('input.takePhoto', config.language)}
            onPress={handleTakePhoto}
          >
            <Camera size={16} color={palette.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mediaBtn}
            accessibilityLabel={t('input.attachDocument', config.language)}
            onPress={handlePickDocument}
          >
            <Paperclip size={16} color={palette.accent} />
          </TouchableOpacity>

          <WebEnterSubmit onSubmit={() => handleSend()}>
            <TextInput
              style={styles.textInput}
              value={inputQuery}
              onChangeText={setInputQuery}
              placeholder={t('input.placeholder', config.language)}
              placeholderTextColor={palette.accentStrong}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
            />
          </WebEnterSubmit>

          <TouchableOpacity
            style={[styles.micBtn, (isRecording || isSpeaking) && styles.micBtnActive]}
            accessibilityLabel={t('input.mic', config.language)}
            onPress={handleMicToggle}
          >
            {isRecording ? (
              <MicOff size={18} color={palette.error} />
            ) : isSpeaking ? (
              <Zap size={18} color={palette.success} />
            ) : (
              <Mic size={18} color={palette.accent} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sendBtn, (!inputQuery.trim() && !selectedImage) && styles.sendBtnDisabled]}
            accessibilityLabel={t('input.send', config.language)}
            onPress={() => handleSend()}
            disabled={(!inputQuery.trim() && !selectedImage) || isProcessing}
          >
            <Send size={16} color={palette.bgDeep} />
          </TouchableOpacity>          </View>
        </View>
      </ScreenReveal>

      {/* One tab bar for the whole app; chat is the active tab here. */}
      <BottomNav active="chat" />

      <SelfHealingModal
        visible={showSelfHealingModal}
        onClose={() => setShowSelfHealingModal(false)}
        onSimulateBug={async () => {
          await selfHealing.simulateBugAndAutoFix();
        }}
      />

      {/* Immersive voice mode: avatar + transcript + animated action read-out */}
      {voiceModeOpen && (
        <VoiceModeOverlay
          status={status}
          amplitude={audioAmplitude}
          themeColor={palette.accent}
          avatarStyle="gideon"
          gyroEnabled={config.gyroEnabled ?? true}
          speechText={spokenText}
          speechRate={config.voiceRate}
          mood={mood}
          isRecording={isRecording}
          isSpeaking={isSpeaking}
          isAudible={isAudible}
          userText={liveUserText}
          sevenText={lastSevenText}
          actionLabel={currentAction}
          voiceMode={voiceMode}
          language={config.language || 'en'}
          onMicPress={handleMicToggle}
          onStopSpeaking={stopSpeaking}
          onClose={() => setVoiceModeOpen(false)}
        />
      )}
    </ParticleBackground>
  );
}

const chatStyles = (t: Palette) =>
  ({
    chatNavHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: t.bgDeep,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    backBtnText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 9.5,
      fontWeight: '700',
    },
    headerCenter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
    },
    headerRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    iconBtn: {
      padding: 5,
      borderRadius: 4,
      backgroundColor: t.accentSoft,
    },
    newChatBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: t.info,
    },
    newChatText: {
      fontFamily: FONT.mono,
      color: t.info,
      fontSize: 8.5,
      fontWeight: '800',
    },
    terminalTray: {
      paddingHorizontal: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    chatScroll: {
      flex: 1,
    },
    chatContent: {
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 90,
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: t.bgDeep,
      borderTopWidth: 1,
      borderTopColor: t.border,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.borderStrong,
      paddingHorizontal: 8,
      paddingVertical: 4,
      gap: 6,
    },
    textInput: {
      flex: 1,
      color: t.text,
      fontFamily: FONT.mono,
      fontSize: 12,
      paddingVertical: 6,
      paddingHorizontal: 6,
    },
    mediaBtn: {
      padding: 6,
      borderRadius: 4,
      backgroundColor: t.accentSoft,
    },
    imagePreviewBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.accent,
      marginBottom: 6,
      gap: 8,
    },
    imageThumbnail: {
      width: 32,
      height: 32,
      borderRadius: 4,
    },
    imagePreviewText: {
      flex: 1,
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 10,
      fontWeight: '700',
    },
    clearImageBtn: {
      padding: 4,
    },
    micBtn: {
      padding: 6,
      borderRadius: 4,
      backgroundColor: t.accentSoft,
    },
    micBtnActive: {
      backgroundColor: t.error,
    },
    sendBtn: {
      padding: 8,
      borderRadius: 4,
      backgroundColor: t.accent,
    },
    sendBtnDisabled: {
      opacity: 0.4,
    },
  } as const);
