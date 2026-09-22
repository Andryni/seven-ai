import React, { useState, useEffect } from 'react';
import { FONT } from '../src/theme/typography';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { BottomNav } from '../src/components/BottomNav';
import { TerminalLog } from '../src/components/TerminalLog';
import { fileOrganizer } from '../src/services/fileOrganizer';
import { haptics } from '../src/services/hapticsService';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { t } from '../src/theme/i18n';
import {
  FolderSync,
  RotateCcw,
  Image as ImageIcon,
  FileText,
  Package,
  Music,
  Video,
  Code2,
  FolderArchive,
  ChevronLeft,
  CheckCircle2,
  HardDrive,
} from 'lucide-react-native';

export default function OrganizerScreen() {
  const router = useRouter();
  const config = useSevenStore((s) => s.config);
  const lastOrganizeResult = useSevenStore((s) => s.lastOrganizeResult);
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);

  const palette = useTheme();
  const styles = useThemeStyles(organizerStyles);
  const lang = config.language ?? 'en';

  const [loading, setLoading] = useState(false);
  const [undoLoading, setUndoLoading] = useState(false);

  useEffect(() => {
    fileOrganizer.ensureDownloadsFolder().catch(() => {});
  }, []);

  const handleOrganize = async () => {
    haptics.light();
    setLoading(true);
    try {
      await fileOrganizer.organizeDownloads();
      haptics.success();
    } catch (e: any) {
      haptics.error();
      addTerminalLog(`Organizer Exception: ${e?.message || e}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    haptics.medium();
    setUndoLoading(true);
    try {
      await fileOrganizer.undoLastOrganization();
    } catch (e: any) {
      haptics.error();
      addTerminalLog(`Undo Exception: ${e?.message || e}`, 'error');
    } finally {
      setUndoLoading(false);
    }
  };

  // Only show real results; the previous fake default counts (Images: 2, etc.)
  // mislead users into thinking an organization had already run.
  const categories = lastOrganizeResult?.categories || {};

  const getCategoryIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'images':
        return <ImageIcon size={16} color={palette.info} />;
      case 'documents':
        return <FileText size={16} color={palette.accent} />;
      case 'installers':
        return <Package size={16} color={palette.success} />;
      case 'audio':
        return <Music size={16} color={palette.warning} />;
      case 'video':
        return <Video size={16} color={palette.error} />;
      case 'code':
        return <Code2 size={16} color={palette.accent} />;
      default:
        return <FolderArchive size={16} color={palette.text} />;
    }
  };

  return (
    <ParticleBackground>
      <HudHeader />

      {/* Screen Header */}
      <ScreenReveal index={0}>
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/')}>
          <ChevronLeft size={16} color={palette.accent} />
          <Text style={styles.backBtnText}>DASHBOARD</Text>
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <FolderSync size={15} color={palette.success} />
          <Text style={styles.titleText}>{t('organizer.title', lang)}</Text>
        </View>

        <View style={styles.placeholderRight} />
      </View>
      </ScreenReveal>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Banner / Info Card */}
        <ScreenReveal index={1}>
        <View style={styles.bannerCard}>
          <View style={styles.bannerHeader}>
            <HardDrive size={16} color={palette.accent} />
            <Text style={styles.bannerTitle}>DOWNLOADS DIRECTORY // APP SANDBOX</Text>
          </View>
          <Text style={styles.bannerDesc}>
            Scans the app Downloads directory, analyzes file signatures, creates
            clean categorized subfolders, and records a reversible JSON journal for 1-click Undo.
          </Text>

          {/* Action Buttons Row */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.primaryOrganizeBtn, loading && styles.btnLoading]}
              onPress={handleOrganize}
              disabled={loading}
            >
              <FolderSync size={15} color={palette.bgDeep} />
              <Text style={styles.primaryOrganizeText}>
                {loading ? 'ORGANIZING...' : t('organizer.organize', lang).toUpperCase()}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.undoBtn,
                (!lastOrganizeResult || lastOrganizeResult.status === 'undone') &&
                  styles.undoBtnDisabled,
              ]}
              onPress={handleUndo}
              disabled={undoLoading || !lastOrganizeResult || lastOrganizeResult.status === 'undone'}
            >
              <RotateCcw size={14} color={palette.accent} />
              <Text style={styles.undoBtnText}>
                {undoLoading ? 'RESTORING...' : t('organizer.undo', lang).toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScreenReveal>

        {/* Live Terminal Log Component */}
        <ScreenReveal index={2}>
          <Text style={styles.sectionHeader}>STORAGE KERNEL LOG</Text>
          <TerminalLog maxHeight={190} title="SEVEN_OS // FILE_ORGANIZER.SYS" />
        </ScreenReveal>

        {/* Category breakdown Grid */}
        <ScreenReveal index={3}>
        <Text style={styles.sectionHeader}>AUTOMATIC CLASSIFICATION MATRIX</Text>
        {Object.keys(categories).length === 0 && (
          <Text style={styles.emptyMatrixText}>
            NO SESSION YET — RUN ORGANIZE DOWNLOADS TO POPULATE THIS MATRIX.
          </Text>
        )}
        <View style={styles.categoryGrid}>
          {Object.entries(categories).map(([catName, count]) => (
            <View key={catName} style={styles.categoryCard}>
              <View style={styles.catHeader}>
                {getCategoryIcon(catName)}
                <Text style={styles.catCountBadge}>{count} files</Text>
              </View>
              <Text style={styles.catName}>{catName.toUpperCase()}</Text>
              <Text style={styles.catFolder}>/Downloads/{catName}/</Text>
            </View>
          ))}
        </View>
        </ScreenReveal>

        {/* Moved Files List if available */}
        {lastOrganizeResult && lastOrganizeResult.files.length > 0 && (
          <ScreenReveal index={4}>
          <View style={styles.filesCard}>
            <View style={styles.filesHeader}>
              <CheckCircle2 size={13} color={palette.success} />
              <Text style={styles.filesTitle}>
                JOURNAL STATUS: {lastOrganizeResult.status.toUpperCase()} ({lastOrganizeResult.files.length} ITEMS)
              </Text>
            </View>

            {lastOrganizeResult.files.map((f) => (
              <View key={f.id} style={styles.fileRow}>
                <View style={styles.fileLeft}>
                  {getCategoryIcon(f.category)}
                  <Text style={styles.fileName}>{f.name}</Text>
                </View>
                <Text style={styles.fileCatTag}>{f.category}</Text>
              </View>
            ))}
          </View>
          </ScreenReveal>
        )}
      </ScrollView>

      <BottomNav active="organizer" />
    </ParticleBackground>
  );
}

const organizerStyles = (t: Palette) =>
  ({
    topNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    titleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    titleText: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
    },
    placeholderRight: {
      width: 60,
    },
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 40,
    },
    bannerCard: {
      backgroundColor: t.bgElevated,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      padding: 14,
      marginBottom: 14,
    },
    bannerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    bannerTitle: {
      fontFamily: FONT.mono,
      color: t.success,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    bannerDesc: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 10,
      lineHeight: 14,
      marginBottom: 14,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    primaryOrganizeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.success,
      paddingVertical: 10,
      borderRadius: 5,
      gap: 6,
    },
    btnLoading: {
      opacity: 0.7,
    },
    primaryOrganizeText: {
      fontFamily: FONT.mono,
      color: t.bgDeep,
      fontSize: 10.5,
      fontWeight: '900',
      letterSpacing: 1,
    },
    undoBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.accent,
      paddingVertical: 10,
      borderRadius: 5,
      gap: 6,
    },
    undoBtnDisabled: {
      opacity: 0.35,
    },
    undoBtnText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    sectionHeader: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      marginTop: 10,
      marginBottom: 6,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    categoryCard: {
      width: '48%',
      backgroundColor: t.bgElevated,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.border,
      padding: 10,
    },
    catHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    catCountBadge: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9,
    },
    catName: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 11,
      fontWeight: '800',
    },
    catFolder: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 8.5,
      marginTop: 2,
    },
    filesCard: {
      backgroundColor: t.bgDeep,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.border,
      padding: 10,
    },
    filesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    filesTitle: {
      fontFamily: FONT.mono,
      color: t.success,
      fontSize: 9.5,
      fontWeight: '800',
    },
    fileRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    fileLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    fileName: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 10,
    },
    fileCatTag: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 8.5,
    },
    emptyMatrixText: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 9.5,
      marginBottom: 8,
    },
  } as const);
