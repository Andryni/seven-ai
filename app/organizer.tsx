import React, { useState, useEffect } from 'react';
import { FONT } from '../src/theme/typography';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { CapabilityHero } from '../src/components/CapabilityHero';
import { BottomNav } from '../src/components/BottomNav';
import { TerminalLog } from '../src/components/TerminalLog';
import { TypingDots } from '../src/components/LoadingIndicators';
import { fileOrganizer } from '../src/services/fileOrganizer';
import { haptics } from '../src/services/hapticsService';
import { soundFx } from '../src/services/soundFxService';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import type { OrganizeResult } from '../src/types';
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
  FolderOpen,
  FolderLock,
  Square,
  CheckSquare2,
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
  const [preview, setPreview] = useState<OrganizeResult | null>(null);
  const [excludedPaths, setExcludedPaths] = useState<string[]>([]);

  useEffect(() => {
    fileOrganizer.ensureDownloadsFolder().catch(() => {});
  }, []);

  const handleSelectDirectory = async () => {
    haptics.light();
    try {
      const result = await fileOrganizer.selectPublicDirectory();
      if (!result.granted) addTerminalLog(t('organizer.permissionDenied', lang), 'warn');
    } catch (e: any) {
      addTerminalLog(`${t('organizer.permissionError', lang)}: ${e?.message || e}`, 'error');
    }
  };

  const handleOrganize = async () => {
    haptics.light();
    setLoading(true);
    try {
      if (!preview) {
        const plan = await fileOrganizer.previewOrganization();
        setPreview(plan);
        setExcludedPaths([]);
        addTerminalLog(plan.message, 'info');
        return;
      }
      soundFx.playLaserWhoosh();
      await fileOrganizer.organizeDownloads(excludedPaths);
      setPreview(null);
      setExcludedPaths([]);
      haptics.success();
      soundFx.playPatchSuccess();
    } catch (e: any) {
      haptics.error();
      addTerminalLog(`Organizer Exception: ${e?.message || e}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const togglePlannedFile = (path: string) => {
    haptics.light();
    setExcludedPaths((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
    );
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
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityLabel={t('nav.dashboard', lang)}
          onPress={() => router.push('/')}
        >
          <ChevronLeft size={16} color={palette.accent} />
          <Text style={styles.backBtnText}>{t('nav.dashboard', lang)}</Text>
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <FolderSync size={15} color={palette.success} />
          <Text style={styles.titleText}>{t('organizer.title', lang)}</Text>
        </View>

        <View style={styles.placeholderRight} />
      </View>
      </ScreenReveal>

      {/* The moved-files journal can grow with a large Downloads folder, so it
          is the one virtualized list here; everything above it (banner,
          category grid) is a fixed-size header rendered once. */}
      <FlatList
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        data={lastOrganizeResult?.files ?? []}
        keyExtractor={(f) => f.id}
        removeClippedSubviews
        initialNumToRender={20}
        renderItem={({ item: f }) => (
          <View style={styles.fileRow}>
            <View style={styles.fileLeft}>
              {getCategoryIcon(f.category)}
              <Text style={styles.fileName}>{f.name}</Text>
            </View>
            <Text style={styles.fileCatTag}>{f.category}</Text>
          </View>
        )}
        ListHeaderComponent={
          <>
        <ScreenReveal index={1}>
          <CapabilityHero
            eyebrow={t('organizer.heroEyebrow', lang)}
            title={t('organizer.heroTitle', lang)}
            description={t('organizer.heroDescription', lang)}
            icon={<FolderLock size={24} color={palette.accent} />}
            metric={
              lastOrganizeResult
                ? {
                    value: String(lastOrganizeResult.files.length),
                    label: t('organizer.lastRun', lang),
                  }
                : { value: '—', label: t('organizer.noRun', lang) }
            }
            chips={[
              { label: t('organizer.scopedAccess', lang), tone: 'accent' },
              { label: t('organizer.undoJournal', lang), tone: 'success' },
              {
                label: config.organizerDirectoryUri
                  ? t('organizer.publicMode', lang)
                  : t('organizer.privateMode', lang),
                tone: config.organizerDirectoryUri ? 'success' : 'neutral',
              },
            ]}
          />
        </ScreenReveal>

        {/* Banner / Info Card */}
        <ScreenReveal index={2}>
        <View style={styles.bannerCard}>
          <View style={styles.bannerHeader}>
            <HardDrive size={16} color={palette.accent} />
            <Text style={styles.bannerTitle}>
              {config.organizerDirectoryUri
                ? t('organizer.publicDirectory', lang)
                : t('organizer.privateSandbox', lang)}
            </Text>
          </View>
          <Text style={styles.bannerDesc}>
            {config.organizerDirectoryUri
              ? t('organizer.publicDescription', lang)
              : t('organizer.privateDescription', lang)}
          </Text>

          {Platform.OS === 'android' && (
            <TouchableOpacity
              style={styles.directoryBtn}
              accessibilityRole="button"
              accessibilityLabel={t('organizer.selectDirectory', lang)}
              onPress={handleSelectDirectory}
            >
              <FolderOpen size={15} color={palette.accent} />
              <Text style={styles.directoryBtnText}>{t('organizer.selectDirectory', lang)}</Text>
            </TouchableOpacity>
          )}

          {/* Action Buttons Row */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.primaryOrganizeBtn, loading && styles.btnLoading]}
              accessibilityLabel={t('organizer.organize', lang)}
              onPress={handleOrganize}
              disabled={loading}
            >
              <FolderSync size={15} color={palette.bgDeep} />
              <Text style={styles.primaryOrganizeText}>
                {loading
                  ? t('organizer.organizing', lang)
                  : preview
                    ? t('organizer.confirmPlan', lang)
                    : t('organizer.previewPlan', lang)}
              </Text>
              {loading && <TypingDots color={palette.bgDeep} size={4} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.undoBtn,
                (!lastOrganizeResult || lastOrganizeResult.status === 'undone') &&
                  styles.undoBtnDisabled,
              ]}
              accessibilityLabel={t('organizer.undo', lang)}
              onPress={handleUndo}
              disabled={undoLoading || !lastOrganizeResult || lastOrganizeResult.status === 'undone'}
            >
              <RotateCcw size={14} color={palette.accent} />
              <Text style={styles.undoBtnText}>
                {undoLoading ? t('organizer.restoring', lang) : t('organizer.undo', lang).toUpperCase()}
              </Text>
              {undoLoading && <TypingDots color={palette.accent} size={4} />}
            </TouchableOpacity>
          </View>
        </View>
        </ScreenReveal>

        {preview && (
          <ScreenReveal index={3}>
            <View style={styles.planCard}>
              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planTitle}>{t('organizer.planTitle', lang)}</Text>
                  <Text style={styles.planMeta}>
                    {preview.files.length - excludedPaths.length} / {preview.files.length} {t('organizer.files', lang)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.cancelPlanBtn}
                  onPress={() => {
                    setPreview(null);
                    setExcludedPaths([]);
                  }}
                >
                  <Text style={styles.cancelPlanText}>{t('organizer.cancelPlan', lang)}</Text>
                </TouchableOpacity>
              </View>
              {preview.files.map((file) => {
                const included = !excludedPaths.includes(file.originalPath);
                return (
                  <TouchableOpacity
                    key={file.originalPath}
                    style={[styles.planRow, !included && styles.planRowExcluded]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: included }}
                    onPress={() => togglePlannedFile(file.originalPath)}
                  >
                    {included ? (
                      <CheckSquare2 size={17} color={palette.success} />
                    ) : (
                      <Square size={17} color={palette.textFaint} />
                    )}
                    <Text style={styles.planFileName} numberOfLines={1}>{file.name}</Text>
                    <Text style={styles.planDestination}>{file.category}/</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScreenReveal>
        )}

        {/* Live Terminal Log Component */}
        <ScreenReveal index={2}>
          <Text style={styles.sectionHeader}>{t('organizer.log', lang)}</Text>
          <TerminalLog maxHeight={190} title="SEVEN_OS // FILE_ORGANIZER.SYS" />
        </ScreenReveal>

        {/* Category breakdown Grid */}
        <ScreenReveal index={3}>
        <Text style={styles.sectionHeader}>{t('organizer.matrix', lang)}</Text>
        {Object.keys(categories).length === 0 && (
          <Text style={styles.emptyMatrixText}>
            {t('organizer.empty', lang)}
          </Text>
        )}
        <View style={styles.categoryGrid}>
          {Object.entries(categories).map(([catName, count]) => (
            <View key={catName} style={styles.categoryCard}>
              <View style={styles.catHeader}>
                {getCategoryIcon(catName)}
                <Text style={styles.catCountBadge}>{count} {t('organizer.files', lang)}</Text>
              </View>
              <Text style={styles.catName}>{catName.toUpperCase()}</Text>
              <Text style={styles.catFolder}>/Downloads/{catName}/</Text>
            </View>
          ))}
        </View>
        </ScreenReveal>

        {/* Moved Files List header — the rows themselves are the FlatList's
            virtualized items (see renderItem above), not mapped here. */}
        {lastOrganizeResult && lastOrganizeResult.files.length > 0 && (
          <ScreenReveal index={4}>
            <View style={styles.filesCardHeaderOnly}>
              <View style={styles.filesHeader}>
                <CheckCircle2 size={13} color={palette.success} />
                <Text style={styles.filesTitle}>
                  {t('organizer.journal', lang)}: {lastOrganizeResult.status.toUpperCase()} ({lastOrganizeResult.files.length} {t('organizer.files', lang).toUpperCase()})
                </Text>
              </View>
            </View>
          </ScreenReveal>
        )}
          </>
        }
        ListFooterComponent={<View style={styles.filesCardFooterSpace} />}
      />

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
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.borderStrong,
      padding: 16,
      marginBottom: 14,
    },
    bannerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    bannerTitle: {
      fontFamily: FONT.monoBold,
      color: t.success,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    bannerDesc: {
      fontFamily: FONT.ui,
      color: t.textDim,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
    },
    directoryBtn: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: t.borderStrong,
      backgroundColor: t.accentSoft,
      borderRadius: 5,
      marginBottom: 12,
      paddingHorizontal: 12,
    },
    directoryBtnText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 11,
      fontWeight: '800',
    },
    actionButtonsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    primaryOrganizeBtn: {
      flex: 1,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.success,
      paddingVertical: 11,
      borderRadius: 10,
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
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.accent,
      paddingVertical: 11,
      borderRadius: 10,
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
    planCard: {
      backgroundColor: t.bgElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.borderStrong,
      padding: 12,
      marginBottom: 12,
    },
    planHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    planTitle: {
      color: t.text,
      fontFamily: FONT.uiMedium,
      fontSize: 15,
    },
    planMeta: {
      color: t.accent,
      fontFamily: FONT.mono,
      fontSize: 10,
      marginTop: 2,
    },
    cancelPlanBtn: {
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: t.accentSoft,
    },
    cancelPlanText: {
      color: t.error,
      fontFamily: FONT.monoBold,
      fontSize: 9,
    },
    planRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    planRowExcluded: { opacity: 0.45 },
    planFileName: {
      flex: 1,
      color: t.text,
      fontFamily: FONT.ui,
      fontSize: 13,
    },
    planDestination: {
      color: t.accent,
      fontFamily: FONT.mono,
      fontSize: 10,
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
      minHeight: 92,
      backgroundColor: t.bgElevated,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      padding: 12,
      justifyContent: 'space-between',
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
      fontSize: 10,
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
      fontSize: 10,
      marginTop: 3,
    },
    filesCard: {
      backgroundColor: t.bgDeep,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.border,
      padding: 10,
    },
    // The journal is now a FlatList (see OrganizerScreen): this wraps only
    // the header row, while `fileRow` items render as virtualized siblings
    // below it — same visual well, split so items above ~20 stay fast.
    filesCardHeaderOnly: {
      backgroundColor: t.bgDeep,
      borderTopLeftRadius: 6,
      borderTopRightRadius: 6,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: t.border,
      paddingHorizontal: 10,
      paddingTop: 10,
    },
    filesCardFooterSpace: {
      height: 8,
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
      minHeight: 44,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: t.bgDeep,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: t.border,
    },
    fileLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    fileName: {
      flexShrink: 1,
      fontFamily: FONT.ui,
      color: t.text,
      fontSize: 13,
    },
    fileCatTag: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 10,
      marginLeft: 8,
    },
    emptyMatrixText: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 9.5,
      marginBottom: 8,
    },
  } as const);
