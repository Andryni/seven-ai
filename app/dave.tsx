import React, { useState, useEffect } from 'react';
import { FONT } from '../src/theme/typography';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { TerminalLog } from '../src/components/TerminalLog';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { TypingDots } from '../src/components/LoadingIndicators';
import { BottomNav } from '../src/components/BottomNav';
import { WebViewPreview } from '../src/components/WebViewPreview';
import { SelfHealingModal } from '../src/components/SelfHealingModal';
import { CodeEditorModal } from '../src/components/CodeEditorModal';
import { ProjectManagerModal } from '../src/components/ProjectManagerModal';
import { daveAgent } from '../src/core/daveAgent';
import { selfHealing } from '../src/core/selfHealing';
import { soundFx } from '../src/services/soundFxService';
import { haptics } from '../src/services/hapticsService';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { t } from '../src/theme/i18n';
import {
  Code2,
  Play,
  ChevronLeft,
  Sparkles,
  Layers,
  ShieldAlert,
  Edit3,
  Wand2,
  GitCompare,
  TestTube2,
  History,
} from 'lucide-react-native';

const PRESET_PROMPTS = [
  'make a good developer portfolio website',
  'build a modern AI Agent SaaS landing page with dark mode and pricing',
  'create a high-tech robotics telemetry dashboard with live gauges',
  'build a retro arcade mini-game in pure HTML canvas with neon laser mechanics',
];

export default function DaveAgentScreen() {
  const router = useRouter();
  const config = useSevenStore((s) => s.config);
  const daveProjects = useSevenStore((s) => s.daveProjects);
  const activeDaveProject = useSevenStore((s) => s.activeDaveProject);
  const setActiveDaveProject = useSevenStore((s) => s.setActiveDaveProject);
  const addDaveProject = useSevenStore((s) => s.addDaveProject);
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);

  const palette = useTheme();
  const styles = useThemeStyles(daveStyles);
  const lang = config.language ?? 'en';

  const [prompt, setPrompt] = useState('make a good developer portfolio website');
  const [refineText, setRefineText] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [showSelfHealingModal, setShowSelfHealingModal] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showTemplateHub, setShowTemplateHub] = useState(false);

  const currentProject = activeDaveProject || (daveProjects.length > 0 ? daveProjects[0] : null);

  const handleSynthesize = async (overridePrompt?: string) => {
    const activePrompt = overridePrompt || prompt;
    if (!activePrompt.trim() || isSynthesizing) return;

    haptics.light();
    soundFx.playActivationChime();
    setIsSynthesizing(true);
    try {
      // No forced name: Dave derives a unique name from the prompt, so new
      // builds no longer overwrite previous ones.
      const proj = await daveAgent.buildProject(activePrompt);
      setActiveDaveProject(proj);
      soundFx.playTelemetryPing();
      haptics.success();
    } catch (e: any) {
      haptics.error();
      addTerminalLog(`Dave Synthesis Error: ${e?.message || e}`, 'error');
    } finally {
      setIsSynthesizing(false);
    }
  };

  // If no projects exist, generate initial project on load.
  // Deferred to a macrotask so the effect body stays render-safe
  // (declared after handleSynthesize so the reference is always valid).
  useEffect(() => {
    if (daveProjects.length === 0) {
      const id = setTimeout(() => handleSynthesize('make a good developer portfolio website'), 0);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefine = async () => {
    if (!refineText.trim() || isRefining || !currentProject) return;
    haptics.medium();
    setIsRefining(true);
    try {
      const refined = await daveAgent.refineProject(currentProject, refineText.trim());
      setActiveDaveProject(refined);
      setRefineText('');
      haptics.success();
    } catch (e: any) {
      haptics.error();
      addTerminalLog(`Refine Error: ${e?.message || e}`, 'error');
    } finally {
      setIsRefining(false);
    }
  };

  const handleSimulateBug = async () => {
    setShowSelfHealingModal(true);
    await selfHealing.simulateBugAndAutoFix();
  };

  const handleSaveCode = async (updatedFiles: { 'index.html': string; 'style.css': string; 'script.js': string }) => {
    if (currentProject) {
      const updated = await daveAgent.saveProjectFiles(currentProject, updatedFiles);
      addDaveProject(updated);
      setActiveDaveProject(updated);
      addTerminalLog(`HOT-RELOAD: Versioned ${currentProject.name} source code live.`, 'success');
    }
  };

  const handleRestorePrevious = async () => {
    const previous = currentProject?.versions?.[1];
    if (!currentProject || !previous) return;
    try {
      const restored = await daveAgent.restoreVersion(currentProject, previous.id);
      setActiveDaveProject(restored);
      haptics.success();
    } catch (error: any) {
      addTerminalLog(`RESTORE FAILED: ${error?.message || error}`, 'error');
    }
  };

  return (
    <ParticleBackground>
      <HudHeader />

      {/* Screen Sub-Header */}
      <ScreenReveal index={0}>
      <View style={styles.topNav}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityLabel={t('nav.dashboard', lang)}
          onPress={() => router.push('/')}
        >
          <ChevronLeft size={16} color={palette.accent} />
          <Text style={styles.backBtnText}>DASHBOARD</Text>
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Code2 size={15} color={palette.info} />
          <Text style={styles.titleText}>{t('dave.title', lang)}</Text>
        </View>

        <View style={styles.topNavRight}>
          <TouchableOpacity
            style={styles.templateBtn}
            accessibilityLabel="Templates"
            onPress={() => {
              haptics.light();
              setShowTemplateHub(true);
            }}
          >
            <Layers size={13} color={palette.info} />
            <Text style={styles.templateBtnText}>TEMPLATES</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.antiPanicBtn}
            accessibilityLabel={lang === 'fr' ? 'Journal auto-réparation AST' : 'AST self-healing log'}
            onPress={() => setShowSelfHealingModal(true)}
          >
            <ShieldAlert size={13} color={palette.error} />
            <Text style={styles.antiPanicText}>AST</Text>
          </TouchableOpacity>
        </View>
      </View>
      </ScreenReveal>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Prompt Input Deck */}
        <ScreenReveal index={1}>
        <View style={styles.promptDeck}>
          <View style={styles.promptLabelRow}>
            <Sparkles size={13} color={palette.info} />
            <Text style={styles.promptLabel}>{t('dave.prompt', lang)}</Text>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="e.g. make a good developer portfolio website"
              placeholderTextColor={palette.textFaint}
            />
            <TouchableOpacity
              style={[styles.synthesizeBtn, isSynthesizing && styles.btnLoading]}
              accessibilityLabel={t('dave.build', lang)}
              onPress={() => handleSynthesize()}
              disabled={isSynthesizing}
            >
              <Play size={14} color={palette.bgDeep} />
              <Text style={styles.synthesizeText}>
                {isSynthesizing ? 'BUILDING' : t('dave.build', lang)}
              </Text>
              {isSynthesizing && <TypingDots color={palette.bgDeep} size={4} />}
            </TouchableOpacity>
          </View>

          {/* Preset Prompts */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presetsScroll}
            contentContainerStyle={styles.presetsContainer}
          >
            {PRESET_PROMPTS.map((p, i) => (
              <TouchableOpacity
                key={i}
                style={styles.presetChip}
                accessibilityLabel={p}
                onPress={() => {
                  setPrompt(p);
                  handleSynthesize(p);
                }}
              >
                <Text style={styles.presetChipText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Iterative refinement (only meaningful with an active project) */}
          {currentProject && (
            <View style={styles.refineSection}>
              <View style={styles.promptLabelRow}>
                <Wand2 size={13} color={palette.accent} />
                <Text style={styles.refineLabel}>
                  {t('dave.iteration', lang)} — {currentProject.name}
                </Text>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.textInput}
                  value={refineText}
                  onChangeText={setRefineText}
                  placeholder={t('dave.refinePlaceholder', lang)}
                  placeholderTextColor={palette.textFaint}
                  onSubmitEditing={handleRefine}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[styles.refineBtn, (isRefining || !refineText.trim()) && styles.btnLoading]}
                  accessibilityLabel={t('dave.refine', lang)}
                  onPress={handleRefine}
                  disabled={isRefining || !refineText.trim()}
                >
                  <Wand2 size={13} color={palette.bgDeep} />
                  <Text style={styles.refineBtnText}>
                    {isRefining ? 'APPLYING' : t('dave.refine', lang)}
                  </Text>
                  {isRefining && <TypingDots color={palette.bgDeep} size={4} />}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
        </ScreenReveal>

        {/* Live Terminal Log Component */}
        <ScreenReveal index={2}>
          <TerminalLog maxHeight={150} title="SEVEN_OS // DAVE_AGENT.SYNTHESIZER" />
        </ScreenReveal>

        {currentProject && (
          <ScreenReveal index={3}>
            <View style={styles.engineeringPanel}>
              <View style={styles.engineeringHeader}>
                <View style={styles.previewTitleLeft}>
                  <History size={14} color={palette.info} />
                  <Text style={styles.engineeringTitle}>ENGINEERING CONTROL</Text>
                </View>
                <Text style={styles.versionCount}>{currentProject.versions?.length || 0} VERSIONS</Text>
              </View>
              <View style={styles.engineeringActions}>
                <TouchableOpacity style={styles.engineeringBtn} onPress={() => daveAgent.runProjectTests(currentProject)}>
                  <TestTube2 size={13} color={palette.success} />
                  <Text style={styles.engineeringBtnText}>RUN TESTS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.engineeringBtn, !currentProject.versions?.[1] && styles.btnLoading]}
                  disabled={!currentProject.versions?.[1]}
                  onPress={handleRestorePrevious}
                >
                  <History size={13} color={palette.warning} />
                  <Text style={styles.engineeringBtnText}>ROLLBACK</Text>
                </TouchableOpacity>
              </View>
              {currentProject.lastTestReport && (
                <View style={styles.testReport}>
                  <Text style={styles.testScore}>{currentProject.lastTestReport.passed} PASS / {currentProject.lastTestReport.failed} FAIL</Text>
                  {currentProject.lastTestReport.checks.map((check) => (
                    <Text key={check.name} style={[styles.testLine, !check.ok && styles.testFailed]}>
                      {check.ok ? '✓' : '×'} {check.name} — {check.detail}
                    </Text>
                  ))}
                </View>
              )}
              {(currentProject.versions?.length || 0) > 1 && (
                <View style={styles.diffPanel}>
                  <View style={styles.previewTitleLeft}>
                    <GitCompare size={12} color={palette.accent} />
                    <Text style={styles.diffTitle}>LATEST DIFF</Text>
                  </View>
                  {daveAgent.diffVersions(currentProject, currentProject.versions![1].id, currentProject.versions![0].id).map((diff) => (
                    <Text key={diff.file} style={styles.diffLine}>{diff.file}  <Text style={styles.diffAdded}>+{diff.added}</Text>  <Text style={styles.diffRemoved}>−{diff.removed}</Text></Text>
                  ))}
                </View>
              )}
            </View>
          </ScreenReveal>
        )}

        {/* Live WebView Preview + Code Inspector */}
        {currentProject && (
          <ScreenReveal index={3}>
          <View style={styles.previewSection}>
            <View style={styles.previewHeader}>
              <View style={styles.previewTitleLeft}>
                <Layers size={14} color={palette.accent} />
                <Text style={styles.previewTitleText}>
                  LIVE ARTIFACT: {currentProject.name.toUpperCase()}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.editCodeBtn}
                accessibilityLabel={lang === 'fr' ? 'Modifier le code' : 'Edit code'}
                onPress={() => {
                  haptics.light();
                  setShowCodeEditor(true);
                }}
              >
                <Edit3 size={12} color={palette.bgDeep} />
                <Text style={styles.editCodeBtnText}>EDIT CODE</Text>
              </TouchableOpacity>
            </View>

            <WebViewPreview
              project={currentProject}
              onTriggerBug={handleSimulateBug}
            />
          </View>
          </ScreenReveal>
        )}
      </ScrollView>

      {/* Code Editor Modal */}
      {currentProject && (
        <CodeEditorModal
          visible={showCodeEditor}
          project={currentProject}
          onClose={() => setShowCodeEditor(false)}
          onSave={handleSaveCode}
        />
      )}

      {/* Template Hub Modal */}
      <ProjectManagerModal
        visible={showTemplateHub}
        onClose={() => setShowTemplateHub(false)}
        onSelectTemplate={(name, tPrompt) => {
          setPrompt(tPrompt);
          handleSynthesize(tPrompt);
        }}
      />

      {/* Self-Healing / Anti-Panic Modal */}
      <SelfHealingModal
        visible={showSelfHealingModal}
        onClose={() => setShowSelfHealingModal(false)}
        onSimulateBug={async () => {
          await selfHealing.simulateBugAndAutoFix();
        }}
      />

      <BottomNav active="dave" />
    </ParticleBackground>
  );
}

const daveStyles = (t: Palette) =>
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
    topNavRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    templateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.info,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
      gap: 4,
    },
    templateBtnText: {
      fontFamily: FONT.mono,
      color: t.info,
      fontSize: 8.5,
      fontWeight: '800',
    },
    antiPanicBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.error,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
      gap: 4,
    },
    antiPanicText: {
      fontFamily: FONT.mono,
      color: t.error,
      fontSize: 8.5,
      fontWeight: '800',
    },
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 40,
    },
    promptDeck: {
      backgroundColor: t.bgElevated,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      padding: 12,
      marginBottom: 10,
    },
    promptLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    promptLabel: {
      fontFamily: FONT.mono,
      color: t.info,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    refineLabel: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      flex: 1,
    },
    refineSection: {
      marginTop: 14,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    inputRow: {
      flexDirection: 'row',
      gap: 8,
    },
    textInput: {
      flex: 1,
      backgroundColor: t.bgDeep,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: t.text,
      fontFamily: FONT.mono,
      fontSize: 11.5,
    },
    synthesizeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.info,
      paddingHorizontal: 14,
      borderRadius: 4,
      gap: 6,
    },
    btnLoading: {
      opacity: 0.6,
    },
    synthesizeText: {
      fontFamily: FONT.mono,
      color: t.bgDeep,
      fontSize: 10.5,
      fontWeight: '900',
      letterSpacing: 1,
    },
    refineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.accent,
      paddingHorizontal: 12,
      borderRadius: 4,
      gap: 5,
    },
    refineBtnText: {
      fontFamily: FONT.mono,
      color: t.bgDeep,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    presetsScroll: {
      marginTop: 10,
    },
    presetsContainer: {
      gap: 6,
    },
    presetChip: {
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 3,
    },
    presetChipText: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9.5,
    },
    engineeringPanel: { marginTop: 10, backgroundColor: t.bgElevated, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 8, padding: 11 },
    engineeringHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
    engineeringTitle: { color: t.info, fontFamily: FONT.monoBold, fontSize: 10, letterSpacing: 1 },
    versionCount: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 8 },
    engineeringActions: { flexDirection: 'row', gap: 7 },
    engineeringBtn: { flex: 1, minHeight: 38, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.bgDeep, borderRadius: 5 },
    engineeringBtnText: { color: t.text, fontFamily: FONT.monoBold, fontSize: 8 },
    testReport: { marginTop: 9, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 7 },
    testScore: { color: t.success, fontFamily: FONT.monoBold, fontSize: 9, marginBottom: 5 },
    testLine: { color: t.textDim, fontFamily: FONT.mono, fontSize: 8, lineHeight: 14 },
    testFailed: { color: t.error },
    diffPanel: { marginTop: 9, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 7 },
    diffTitle: { color: t.accent, fontFamily: FONT.monoBold, fontSize: 8 },
    diffLine: { color: t.textDim, fontFamily: FONT.mono, fontSize: 8, marginTop: 5 },
    diffAdded: { color: t.success },
    diffRemoved: { color: t.error },
    previewSection: {
      marginTop: 10,
    },
    previewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
      paddingHorizontal: 2,
    },
    previewTitleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    previewTitleText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    editCodeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.success,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 3,
      gap: 4,
    },
    editCodeBtnText: {
      fontFamily: FONT.mono,
      color: t.bgDeep,
      fontSize: 9,
      fontWeight: '900',
    },
  } as const);
