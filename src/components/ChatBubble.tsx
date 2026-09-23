import React, { useState, useMemo } from 'react';
import { FONT, TABULAR } from '../theme/typography';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ChatMessage } from '../types';
import { MarkdownText } from './MarkdownText';
import { TypingDots, ScanBar } from './LoadingIndicators';
import {
  Cpu,
  User,
  ExternalLink,
  RotateCcw,
  FileCode,
  FolderSync,
  FileText,
  ShieldCheck,
  Eye,
  Copy,
  Share2,
  Check,
  Globe,
  Smartphone,
  Camera,
} from 'lucide-react-native';

interface ChatBubbleProps {
  message: ChatMessage;
  onAction?: (actionType: string, payload?: unknown) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, onAction }) => {
  const isUser = message.sender === 'user';
  const isSystem = message.sender === 'system';
  const [copied, setCopied] = useState(false);

  // While SEVEN works, the placeholder bubble is either fully empty (pass 1
  // in flight) or only contains tool-progress markers like ⟨WEB INTELLIGENCE: …⟩.
  const progressLines = useMemo(() => {
    if (isUser || isSystem) return [] as string[];
    const matches = message.text.match(/\u27e8[^\u27e9]+\u27e9/g);
    return matches ? matches.map((s) => s.slice(1, -1).trim()).filter(Boolean) : [];
  }, [message.text, isUser, isSystem]);
  const hasPlainContent =
    message.text.replace(/\u27e8[^\u27e9]*\u27e9/g, '').trim().length > 0;
  const isPendingAssistant = !isUser && !isSystem && !hasPlainContent && !message.imageUri;

  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const handleShare = async () => {
    try {
      if (Platform.OS === 'web') {
        const nav = navigator as any;
        if (nav?.share) {
          await nav.share({ text: message.text });
        } else if (nav?.clipboard) {
          await nav.clipboard.writeText(message.text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      } else {
        await Share.share({ title: 'Seven AI', message: message.text });
      }
    } catch (e) {
      console.warn('Share failed:', e);
    }
  };

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.sevenContainer]}>
      {/* Header with avatar & name */}
      <View style={[styles.headerRow, isUser ? styles.userHeader : styles.sevenHeader]}>
        {!isUser && (
          <View style={styles.avatarSeven}>
            <Cpu size={12} color="#FFD700" />
          </View>
        )}
        <Text style={[styles.senderName, isUser ? styles.userNameText : styles.sevenNameText]}>
          {isUser ? 'USER // YOU' : isSystem ? 'SYSTEM' : 'SEVEN AI'}
        </Text>
        <Text style={styles.timestampText}>{timeStr}</Text>
        {isUser && (
          <View style={styles.avatarUser}>
            <User size={12} color="#00E5FF" />
          </View>
        )}
      </View>

      {/* Message Bubble Body */}
      <View style={[styles.bubbleBody, isUser ? styles.userBubble : styles.sevenBubble]}>
        {message.imageUri && (
          <View style={styles.imageAttachmentContainer}>
            <Image source={{ uri: message.imageUri }} style={styles.imageAttachment} resizeMode="cover" />
          </View>
        )}

        {isPendingAssistant ? (
          // Waiting-for-response animation (empty placeholder bubble)
          <View style={styles.pendingRow}>
            <TypingDots />
            <Text style={styles.pendingText}>PROCESSING DIRECTIVE…</Text>
          </View>
        ) : (
          <>
            {/* Tool progress lines (streamed status markers) */}
            {progressLines.length > 0 && !hasPlainContent && (
              <View style={styles.progressBlock}>
                {progressLines.map((line, i) => (
                  <View key={i} style={styles.progressRow}>
                    <View style={styles.progressBullet} />
                    <Text style={styles.progressText} numberOfLines={1}>
                      {line}
                    </Text>
                  </View>
                ))}
                <ScanBar color="#00E5FF" />
                <TypingDots color="#00E5FF" />
              </View>
            )}

            {hasPlainContent && (
              isUser ? (
                // User turns are typed, plain text — Markdown parsing would
                // just be noise on "what's 2 * 3?" or a pasted URL.
                <Text style={[styles.bodyText, styles.userBodyText]}>{message.text}</Text>
              ) : (
                // Gemini answers routinely use **bold**, lists and fenced code —
                // render them instead of showing the raw asterisks/backticks.
                <MarkdownText
                  text={
                    progressLines.length > 0
                      ? message.text.replace(/\u27e8[^\u27e9]*\u27e9/g, '').replace(/^\s+/, '')
                      : message.text
                  }
                  color="#FFF8E1"
                  accentColor="#FFD700"
                  fontSize={13.5}
                  lineHeight={20}
                />
              )
            )}
          </>
        )}

        {/* Copy / Share actions on assistant replies (once text exists) */}
        {!isUser && !isSystem && message.text.trim().length > 0 && (
          <View style={styles.msgActions}>
            <TouchableOpacity
              style={styles.msgActionBtn}
              accessibilityLabel={copied ? 'Copied' : 'Copy message'}
              onPress={handleCopy}
            >
              {copied ? (
                <>
                  <Check size={11} color="#00FFA3" />
                  <Text style={[styles.msgActionText, styles.msgActionTextCopied]}>COPIED</Text>
                </>
              ) : (
                <>
                  <Copy size={11} color="#FFD700" />
                  <Text style={[styles.msgActionText, styles.msgActionTextCopy]}>COPY</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.msgActionBtn}
              accessibilityLabel="Share message"
              onPress={handleShare}
            >
              <Share2 size={11} color="#00E5FF" />
              <Text style={[styles.msgActionText, styles.msgActionTextShare]}>SHARE</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Inline Tool Call Result Card */}
        {message.toolCall && (
          <View style={styles.toolCard}>
            <View style={styles.toolHeader}>
              {message.toolCall.name === 'dave_build' && <FileCode size={14} color="#00E5FF" />}
              {message.toolCall.name === 'organizer' && <FolderSync size={14} color="#00FFA3" />}
              {message.toolCall.name === 'research_pdf' && <FileText size={14} color="#FFD700" />}
              {message.toolCall.name === 'self_heal' && <ShieldCheck size={14} color="#BD00FF" />}
              {message.toolCall.name === 'web_search' && <Globe size={14} color="#38BDF8" />}
              {message.toolCall.name === 'device_action' && <Smartphone size={14} color="#FBBF24" />}
              {message.toolCall.name === 'vision' && <Camera size={14} color="#00E5FF" />}

              <Text style={styles.toolTitle}>
                {message.toolCall.name === 'dave_build' && 'DAVE AGENT // WEB SYNTHESIS'}
                {message.toolCall.name === 'organizer' && 'SMART ORGANIZER // COMPLETED'}
                {message.toolCall.name === 'research_pdf' && 'RESEARCH SYNTHESIS // PDF'}
                {message.toolCall.name === 'self_heal' && 'ANTI-PANIC // HOT PATCH'}
                {message.toolCall.name === 'web_search' && 'WEB INTELLIGENCE // LIVE SEARCH'}
                {message.toolCall.name === 'device_action' && 'DEVICE MATRIX // NATIVE ACTION'}
                {message.toolCall.name === 'vision' && 'SEVEN VISION // MULTIMODAL OCULAR'}
              </Text>

              <View
                style={[
                  styles.statusBadge,
                  message.toolCall.status === 'completed'
                    ? styles.statusSuccess
                    : styles.statusRunning,
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {message.toolCall.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {message.toolCall.summary && (
              <Text style={styles.toolSummary}>{message.toolCall.summary}</Text>
            )}

            {/* Interactive Actions */}
            <View style={styles.toolActions}>
              {message.toolCall.name === 'dave_build' && (
                <>
                  <TouchableOpacity
                    style={styles.actionBtnCyan}
                    accessibilityLabel="Live Preview"
                    onPress={() => onAction?.('open_dave_preview', message.toolCall)}
                  >
                    <Eye size={12} color="#000" />
                    <Text style={styles.actionBtnTextDark}>Live Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtnOutline}
                    accessibilityLabel="Open in browser"
                    onPress={() => onAction?.('open_browser', message.toolCall)}
                  >
                    <ExternalLink size={12} color="#00E5FF" />
                    <Text style={styles.actionBtnTextCyan}>In Browser</Text>
                  </TouchableOpacity>
                </>
              )}

              {message.toolCall.name === 'organizer' && (
                <TouchableOpacity
                  style={styles.actionBtnGold}
                  accessibilityLabel="Undo organization"
                  onPress={() => onAction?.('undo_organize', message.toolCall)}
                >
                  <RotateCcw size={12} color="#000" />
                  <Text style={styles.actionBtnTextDark}>Undo Organization</Text>
                </TouchableOpacity>
              )}

              {message.toolCall.name === 'research_pdf' && (
                <TouchableOpacity
                  style={styles.actionBtnGold}
                  accessibilityLabel="Open PDF document"
                  onPress={() => onAction?.('open_pdf', message.toolCall)}
                >
                  <FileText size={12} color="#000" />
                  <Text style={styles.actionBtnTextDark}>Open PDF Document</Text>
                </TouchableOpacity>
              )}

              {message.toolCall.name === 'self_heal' && (
                <TouchableOpacity
                  style={styles.actionBtnPurple}
                  accessibilityLabel="Inspect patch log"
                  onPress={() => onAction?.('inspect_patch', message.toolCall)}
                >
                  <ShieldCheck size={12} color="#FFF" />
                  <Text style={styles.actionBtnTextWhite}>Inspect Patch Log</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    maxWidth: '92%',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  sevenContainer: {
    alignSelf: 'flex-start',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  userHeader: {
    justifyContent: 'flex-end',
  },
  sevenHeader: {
    justifyContent: 'flex-start',
  },
  avatarSeven: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderWidth: 1,
    borderColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarUser: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#00E5FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  senderName: {
    fontFamily: FONT.uiMedium,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  userNameText: {
    color: '#00E5FF',
  },
  sevenNameText: {
    color: '#FFD700',
  },
  timestampText: {
    fontFamily: FONT.mono,
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    fontVariant: TABULAR,
  },
  bubbleBody: {
    borderRadius: 8,
    padding: 12,
  },
  userBubble: {
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    borderTopRightRadius: 2,
  },
  sevenBubble: {
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    borderTopLeftRadius: 2,
  },
  bodyText: {
    // The assistant's answer is the most-read text in the app: it gets the
    // readable face and real leading, not terminal monospace.
    fontFamily: FONT.ui,
    fontSize: 13.5,
    fontWeight: '400',
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  userBodyText: {
    color: '#E0F7FA',
  },
  sevenBodyText: {
    color: '#FFF8E1',
  },
  msgActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  msgActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  msgActionText: {
    fontFamily: FONT.mono,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  msgActionTextCopy: {
    color: '#FFD700',
  },
  msgActionTextCopied: {
    color: '#00FFA3',
  },
  msgActionTextShare: {
    color: '#00E5FF',
  },
  toolCard: {
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 6,
  },
  toolTitle: {
    fontFamily: FONT.uiMedium,
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '700',
    flex: 1,
    letterSpacing: 0.9,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  statusSuccess: {
    backgroundColor: 'rgba(0, 255, 163, 0.2)',
    borderWidth: 1,
    borderColor: '#00FFA3',
  },
  statusRunning: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  statusBadgeText: {
    fontFamily: FONT.mono,
    fontSize: 8,
    fontWeight: '800',
    color: '#FFF',
  },
  toolSummary: {
    fontFamily: FONT.ui,
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  toolActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtnCyan: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00E5FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    gap: 5,
  },
  actionBtnGold: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    gap: 5,
  },
  actionBtnPurple: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#BD00FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    gap: 5,
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#00E5FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    gap: 5,
  },
  actionBtnTextDark: {
    fontFamily: FONT.uiMedium,
    color: '#050508',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  actionBtnTextCyan: {
    fontFamily: FONT.uiMedium,
    color: '#00E5FF',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  actionBtnTextWhite: {
    fontFamily: FONT.mono,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  imageAttachmentContainer: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#00E5FF',
    backgroundColor: '#0a1018',
  },
  imageAttachment: {
    width: '100%',
    height: 180,
    borderRadius: 6,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  pendingText: {
    fontFamily: FONT.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255, 215, 0, 0.75)',
  },
  progressBlock: {
    gap: 5,
    marginBottom: 4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00E5FF',
  },
  progressText: {
    fontFamily: FONT.mono,
    fontSize: 10,
    color: 'rgba(0, 229, 255, 0.8)',
    flex: 1,
  },
});
