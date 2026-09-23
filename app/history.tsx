import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { BottomNav } from '../src/components/BottomNav';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { t } from '../src/theme/i18n';
import { haptics } from '../src/services/hapticsService';
import type { ChatSession } from '../src/types';
import { FONT } from '../src/theme/typography';
import {
  ChevronLeft,
  History,
  Search,
  X,
  MessageSquare,
  Clock,
  Trash2,
  Pencil,
  Check,
  CornerUpLeft,
  MessageSquarePlus,
  Download,
  FileText,
} from 'lucide-react-native';
import { chatExportService } from '../src/services/chatExportService';

/** "Today 14:32" / "Yesterday" / "12 SEPT" style relative label. */
function formatSessionDate(ts: number, lang: 'fr' | 'en'): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (dayDiff <= 0) {
    return lang === 'fr' ? `Aujourd'hui ${time}` : `Today ${time}`;
  }
  if (dayDiff === 1) return t('history.yesterday', lang);

  const months =
    lang === 'fr'
      ? ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEP', 'OCT', 'NOV', 'DÉC']
      : ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const label = `${d.getDate()} ${months[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
  return dayDiff > 1 && ts > startOfDay(now) - 86400000 * 2 ? `${label} ${time}` : label;
}

export default function HistoryScreen() {
  const router = useRouter();
  const config = useSevenStore((s) => s.config);
  const chatSessions = useSevenStore((s) => s.chatSessions);
  const activeChatSessionId = useSevenStore((s) => s.activeChatSessionId);
  const openChatSession = useSevenStore((s) => s.openChatSession);
  const deleteChatSession = useSevenStore((s) => s.deleteChatSession);
  const renameChatSession = useSevenStore((s) => s.renameChatSession);
  const startNewSession = useSevenStore((s) => s.startNewSession);

  const palette = useTheme();
  const styles = useThemeStyles(historyStyles);
  const lang = config.language ?? 'en';

  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null);

  const filteredSessions = useMemo<ChatSession[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chatSessions;
    return chatSessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.messages.some((m) => m.text.toLowerCase().includes(q)),
    );
  }, [chatSessions, query]);

  const handleOpenSession = (session: ChatSession) => {
    haptics.light();
    openChatSession(session.id);
    router.push('/chat');
  };

  const handleNewChat = () => {
    haptics.medium();
    startNewSession();
    router.push('/chat');
  };

  const handleDelete = (session: ChatSession) => {
    haptics.warning();
    setPendingDelete(session);
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      deleteChatSession(pendingDelete.id);
    }
    setPendingDelete(null);
  };

  const beginRename = (session: ChatSession) => {
    haptics.light();
    setRenamingId(session.id);
    setRenameDraft(session.title);
  };

  const commitRename = () => {
    if (renamingId) {
      renameChatSession(renamingId, renameDraft);
    }
    setRenamingId(null);
    setRenameDraft('');
  };

  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleExportPdf = async (session: ChatSession) => {
    if (exportingId) return;
    haptics.medium();
    setExportingId(session.id);
    try {
      const uri = await chatExportService.exportSessionToPdf(session, lang);
      await chatExportService.shareFile(
        uri,
        'application/pdf',
        lang === 'fr' ? 'Partager la conversation' : 'Share conversation'
      );
    } catch (e) {
      console.warn('Export PDF failed:', e);
    } finally {
      setExportingId(null);
    }
  };

  const handleExportMarkdown = async (session: ChatSession) => {
    if (exportingId) return;
    haptics.medium();
    setExportingId(session.id);
    try {
      const uri = await chatExportService.exportSessionToMarkdown(session, lang);
      await chatExportService.shareFile(
        uri,
        'text/markdown',
        lang === 'fr' ? 'Partager le Markdown' : 'Share Markdown'
      );
    } catch (e) {
      console.warn('Export Markdown failed:', e);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <ParticleBackground>
      <HudHeader />

      {/* Screen Sub-Header */}
      <ScreenReveal index={0}>
        <View style={styles.navHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            accessibilityLabel={t('nav.dashboard', lang)}
            onPress={() => router.push('/')}
          >
            <ChevronLeft size={16} color={palette.accent} />
            <Text style={styles.backBtnText}>DASHBOARD</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <History size={18} color={palette.accent} />
            <View>
              <Text style={styles.headerTitle}>{t('history.title', lang)}</Text>
              <Text style={styles.headerSubtitle}>
                {chatSessions.length} {lang === 'fr' ? 'sessions archivées' : 'archived sessions'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.iconBtn, styles.newChatBtn]}
            accessibilityLabel={t('history.newChat', lang)}
            onPress={handleNewChat}
          >
            <MessageSquarePlus size={15} color={palette.info} />
            <Text style={styles.newChatText}>{t('history.newChat', lang)}</Text>
          </TouchableOpacity>
        </View>
      </ScreenReveal>

      {/* Search Bar */}
      <ScreenReveal index={1}>
        <View style={styles.searchRow}>
          <View style={styles.searchWrapper}>
            <Search size={13} color={palette.textFaint} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t('history.search', lang)}
              placeholderTextColor={palette.textFaint}
            />
            {query.length > 0 && (
              <TouchableOpacity
                accessibilityLabel={lang === 'fr' ? 'Effacer la recherche' : 'Clear search'}
                onPress={() => setQuery('')}
              >
                <X size={13} color={palette.textFaint} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScreenReveal>

      {/* Sessions List — virtualized: this used to render every archived
          session in one ScrollView, which got slower to scroll the longer
          someone used the app. */}
      <FlatList
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        data={filteredSessions}
        keyExtractor={(session) => session.id}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={8}
        initialNumToRender={10}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <History size={30} color={palette.textFaint} />
            <Text style={styles.emptyText}>{t('history.empty', lang)}</Text>
          </View>
        }
        renderItem={({ item: session, index: cardIndex }: ListRenderItemInfo<ChatSession>) => {
          const isCurrent = session.id === activeChatSessionId;
          const lastMsg = session.messages[session.messages.length - 1];
          const preview = lastMsg ? lastMsg.text.replace(/\s+/g, ' ').slice(0, 90) : '';
          const isRenaming = renamingId === session.id;

          return (
            <ScreenReveal key={session.id} index={Math.min(cardIndex, 8)} delay={140}>
              <View style={[styles.sessionCard, isCurrent && styles.sessionCardCurrent]}>
                {/* Card header: icon + title + current badge */}
                <View style={styles.cardTop}>
                  <View style={styles.cardIcon}>
                    <MessageSquare size={13} color={isCurrent ? palette.accent : palette.info} />
                  </View>

                  {isRenaming ? (
                    <View style={styles.renameRow}>
                      <TextInput
                        style={styles.renameInput}
                        value={renameDraft}
                        onChangeText={setRenameDraft}
                        autoFocus
                        selectTextOnFocus
                        onSubmitEditing={commitRename}
                        onBlur={commitRename}
                      />
                      <TouchableOpacity
                        style={styles.renameConfirm}
                        accessibilityLabel={t('common.save', lang)}
                        onPress={commitRename}
                      >
                        <Check size={13} color={palette.success} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.sessionTitle} numberOfLines={1}>
                      {session.title}
                    </Text>
                  )}

                  {isCurrent && !isRenaming && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>{t('history.current', lang)}</Text>
                    </View>
                  )}
                </View>

                {/* Preview of last message */}
                {preview.length > 0 && !isRenaming && (
                  <Text style={styles.sessionPreview} numberOfLines={2}>
                    {preview}
                  </Text>
                )}

                {/* Footer: date + count + actions */}
                <View style={styles.cardFooter}>
                  <View style={styles.metaRow}>
                    <Clock size={10} color={palette.textFaint} />
                    <Text style={styles.metaText}>{formatSessionDate(session.updatedAt, lang)}</Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>
                      {session.messages.length} {t('history.messages', lang)}
                    </Text>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.exportBtn]}
                      accessibilityLabel={t('history.exportPdf', lang)}
                      disabled={exportingId === session.id}
                      onPress={() => handleExportPdf(session)}
                    >
                      <Download size={11} color={palette.info} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.exportBtn]}
                      accessibilityLabel={t('history.exportMd', lang)}
                      disabled={exportingId === session.id}
                      onPress={() => handleExportMarkdown(session)}
                    >
                      <FileText size={11} color={palette.info} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.renameBtn]}
                      accessibilityLabel={t('history.rename', lang)}
                      onPress={() => beginRename(session)}
                    >
                      <Pencil size={11} color={palette.warning} />
                      <Text style={[styles.actionText, { color: palette.warning }]}>
                        {lang === 'fr' ? 'RENOMMER' : 'RENAME'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.deleteBtn]}
                      accessibilityLabel={t('history.delete', lang)}
                      onPress={() => handleDelete(session)}
                    >
                      <Trash2 size={11} color={palette.error} />
                      <Text style={[styles.actionText, { color: palette.error }]}>
                        {lang === 'fr' ? 'SUPPR.' : 'DELETE'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.openBtn]}
                      accessibilityLabel={t('history.open', lang)}
                      onPress={() => handleOpenSession(session)}
                    >
                      <CornerUpLeft size={11} color={palette.bgDeep} />
                      <Text style={styles.openText}>{t('history.open', lang)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScreenReveal>
          );
        }}
      />

      {/* Delete confirmation (Alert.alert is a no-op on web) */}
      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t('history.delete', lang)}
        message={pendingDelete?.title}
        confirmLabel={lang === 'fr' ? 'SUPPRIMER' : 'DELETE'}
        cancelLabel={t('common.cancel', lang)}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <BottomNav active="history" />
    </ParticleBackground>
  );
}

const historyStyles = (t: Palette) =>
  ({
    navHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: t.bgDeep,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
      gap: 8,
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
      flex: 1,
    },
    headerTitle: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
    },
    headerSubtitle: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 8.5,
      marginTop: 1,
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
    searchRow: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    searchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: t.bgElevated,
      borderWidth: 1,
      borderColor: t.borderStrong,
      borderRadius: 6,
      paddingHorizontal: 8,
    },
    searchInput: {
      flex: 1,
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 11,
      paddingVertical: 7,
    },
    listScroll: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: 30,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: 10,
    },
    emptyText: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 11,
      textAlign: 'center',
      lineHeight: 16,
    },
    sessionCard: {
      backgroundColor: t.bgElevated,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: 10,
      marginBottom: 8,
    },
    sessionCardCurrent: {
      borderColor: t.accent,
      borderWidth: 1.5,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardIcon: {
      width: 26,
      height: 26,
      borderRadius: 5,
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sessionTitle: {
      flex: 1,
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 12,
      fontWeight: '700',
    },
    currentBadge: {
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.accent,
      borderRadius: 3,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    currentBadgeText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    renameRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    renameInput: {
      flex: 1,
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 12,
      fontWeight: '700',
      borderWidth: 1,
      borderColor: t.borderStrong,
      borderRadius: 4,
      backgroundColor: t.bgDeep,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    renameConfirm: {
      padding: 5,
      borderRadius: 4,
      backgroundColor: t.accentSoft,
    },
    sessionPreview: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 6,
      marginLeft: 34,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      flexWrap: 'wrap',
      gap: 6,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaText: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 9,
    },
    metaDot: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 9,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 5,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 4,
    },
    exportBtn: {
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 6,
    },
    renameBtn: {
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.border,
    },
    deleteBtn: {
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.border,
    },
    openBtn: {
      backgroundColor: t.accent,
    },
    actionText: {
      fontFamily: FONT.mono,
      fontSize: 8.5,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    openText: {
      fontFamily: FONT.mono,
      color: t.bgDeep,
      fontSize: 8.5,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
  }) as const;
