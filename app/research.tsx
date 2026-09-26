import React, { useState } from 'react';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import { researchStyles } from '../src/theme/researchStyles';
import { t } from '../src/theme/i18n';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { TerminalLog } from '../src/components/TerminalLog';
import { TypingDots } from '../src/components/LoadingIndicators';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { CapabilityHero } from '../src/components/CapabilityHero';
import { BottomNav } from '../src/components/BottomNav';
import { researchService } from '../src/services/researchService';
import { soundFx } from '../src/services/soundFxService';
import { ResearchDocument } from '../src/types';
import {
  FileText,
  Play,
  Share2,
  ChevronLeft,
  Sparkles,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  SearchCheck,
} from 'lucide-react-native';

function sourceProvider(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('wikipedia.org')) return 'WIKIPEDIA';
    if (host.includes('doi.org') || host.includes('crossref.org')) return 'CROSSREF';
    return host.toUpperCase();
  } catch {
    return 'WEB';
  }
}

export default function ResearchScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useThemeStyles(researchStyles);
  const researchDocs = useSevenStore((s) => s.researchDocs);
  const lang = useSevenStore((s) => s.config.language ?? 'en');
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);
  const presetTopics =
    lang === 'fr'
      ? [
          'Rechercher les avancées récentes en IA et créer un PDF',
          'Agents autonomes et architecture de diagnostic AST',
          'Informatique quantique et cryptographie post-quantique',
          'Traitement neuronal en périphérie sur Android 15',
        ]
      : [
          'Research recent AI advances and create a PDF',
          'Autonomous agents and AST diagnostic architecture',
          'Quantum computing and post-quantum cryptography',
          'Edge neural processing on Android 15',
        ];

  const [topic, setTopic] = useState(
    lang === 'fr'
      ? 'Rechercher les avancées récentes en IA et créer un PDF'
      : 'Research recent AI advances and create a PDF'
  );
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [activeDoc, setActiveDoc] = useState<ResearchDocument | null>(
    researchDocs.length > 0 ? researchDocs[0] : null
  );

  const handleResearch = async (overrideTopic?: string) => {
    const active = overrideTopic || topic;
    if (!active.trim() || isSynthesizing) return;

    soundFx.playResearchScan();
    setIsSynthesizing(true);
    try {
      const doc = await researchService.researchTopicAndCreatePdf(active);
      setActiveDoc(doc);
      soundFx.playPatchSuccess();
    } catch (e: any) {
      addTerminalLog(`Research synthesis error: ${e?.message || e}`, 'error');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleShare = async (doc: ResearchDocument) => {
    if (doc.pdfUri) {
      await researchService.sharePdf(doc.pdfUri);
    }
  };

  const currentDoc = activeDoc || (researchDocs.length > 0 ? researchDocs[0] : null);

  return (
    <ParticleBackground>
      <HudHeader />

      {/* Screen Sub-Header */}
      <ScreenReveal index={0}>
      <View style={styles.topNav}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityLabel="Dashboard"
          onPress={() => router.push('/')}
        >
          <ChevronLeft size={16} color={palette.accent} />
          <Text style={styles.backBtnText}>DASHBOARD</Text>
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <FileText size={15} color={palette.accent} />
          <Text style={styles.titleText}>{t('research.title', lang)}</Text>
        </View>

        <View style={styles.placeholderRight} />
      </View>
      </ScreenReveal>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        <ScreenReveal index={1}>
          <CapabilityHero
            eyebrow={t('research.heroEyebrow', lang)}
            title={t('research.heroTitle', lang)}
            description={t('research.heroDescription', lang)}
            icon={<SearchCheck size={24} color={palette.accent} />}
            metric={
              currentDoc
                ? {
                    value: String(currentDoc.sources?.length ?? 0),
                    label: t('research.sourceCount', lang),
                  }
                : undefined
            }
            chips={[
              {
                label: t('research.providerOptional', lang),
                tone: 'accent',
              },
              { label: 'DUCKDUCKGO', tone: 'success' },
              { label: 'WIKIPEDIA', tone: 'success' },
              { label: 'CROSSREF', tone: 'success' },
            ]}
          />
        </ScreenReveal>

        {/* Topic Input Deck */}
        <ScreenReveal index={2}>
        <View style={styles.inputDeck}>
          <View style={styles.labelRow}>
            <Sparkles size={13} color={palette.accent} />
            <Text style={styles.deckLabel}>{t('research.topic', lang)}</Text>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={topic}
              onChangeText={setTopic}
              placeholder={t('research.placeholder', lang)}
              placeholderTextColor={palette.textFaint}
            />
            <TouchableOpacity
              style={[styles.compileBtn, isSynthesizing && styles.btnLoading]}
              accessibilityLabel="Generate PDF"
              onPress={() => handleResearch()}
              disabled={isSynthesizing}
            >
              <Play size={14} color={palette.bgDeep} />
              <Text style={styles.compileText}>
                {isSynthesizing ? t('research.compiling', lang) : t('research.generate', lang)}
              </Text>
              {isSynthesizing && <TypingDots color={palette.bgDeep} size={4} />}
            </TouchableOpacity>
          </View>

          <View style={styles.researchPipeline}>
            {[
              lang === 'fr' ? 'DÉCOMPOSER' : 'DECOMPOSE',
              lang === 'fr' ? 'ACQUÉRIR' : 'ACQUIRE',
              lang === 'fr' ? 'VÉRIFIER' : 'VERIFY',
              lang === 'fr' ? 'SYNTHÉTISER' : 'SYNTHESIZE',
              'PDF',
            ].map((step, index) => (
              <React.Fragment key={step}>
                {index > 0 && <View style={[styles.researchPipelineLink, (isSynthesizing || currentDoc) && styles.researchPipelineLinkActive]} />}
                <View style={styles.researchPipelineStep}>
                  <View style={[styles.researchPipelineNode, (isSynthesizing || currentDoc) && styles.researchPipelineNodeActive]} />
                  <Text style={styles.researchPipelineText}>{step}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          {/* Preset Topics */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presetScroll}
            contentContainerStyle={styles.presetContainer}
          >
            {presetTopics.map((p, i) => (
              <TouchableOpacity
                key={i}
                style={styles.presetChip}
                accessibilityLabel={p}
                onPress={() => {
                  setTopic(p);
                  handleResearch(p);
                }}
              >
                <Text style={styles.presetText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        </ScreenReveal>

        {/* Live Terminal Log Component */}
        <ScreenReveal index={2}>
          <TerminalLog maxHeight={150} title="SEVEN_OS // RESEARCH_ENGINE.SYS" />
        </ScreenReveal>

        {/* Compiled Document Preview Card */}
        {currentDoc && (
          <ScreenReveal index={3}>
          <View style={styles.docCard}>
            <View style={styles.docCardHeader}>
              <View style={styles.docHeaderLeft}>
                <BookOpen size={16} color={palette.accent} />
                <View>
                  <Text style={styles.docTitleText}>{currentDoc.title}</Text>
                  <Text style={styles.docMetaText}>
                    {lang === 'fr' ? 'Sujet' : 'Topic'}: {currentDoc.topic} • {lang === 'fr' ? 'Généré' : 'Generated'}: {new Date(currentDoc.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
              </View>

              <View style={styles.pdfReadyBadge}>
                <CheckCircle2 size={11} color={palette.success} />
                <Text style={styles.pdfReadyText}>{t('research.ready', lang)}</Text>
              </View>
            </View>

            {/* Document Executive Summary */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>{t('research.summary', lang)}</Text>
              <Text style={styles.summaryBody}>{currentDoc.summary}</Text>
            </View>

            {/* Sections Accordion / Preview */}
            <View style={styles.sectionsList}>
              {currentDoc.sections.map((sec: { heading: string; body: string }, idx: number) => (
                <View key={idx} style={styles.sectionItem}>
                  <Text style={styles.sectionHeading}>{sec.heading}</Text>
                  <Text style={styles.sectionBody}>{sec.body}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sourcesBox}>
              <View style={styles.sourceCoverageHeader}>
                <Text style={styles.summaryLabel}>
                  {currentDoc.sources?.length
                    ? `${t('research.sources', lang)} (${currentDoc.sources.length})`
                    : t('research.unverified', lang)}
                </Text>
                {!!currentDoc.sources?.length && (
                  <Text style={styles.coverageText}>
                    {Math.min(100, currentDoc.sources.length * 20)}% {t('research.coverage', lang)}
                  </Text>
                )}
              </View>
              {!!currentDoc.sources?.length && (
                <View style={styles.coverageTrack}>
                  <View
                    style={[
                      styles.coverageFill,
                      { width: `${Math.min(100, currentDoc.sources.length * 20)}%` },
                    ]}
                  />
                </View>
              )}
              {currentDoc.sources?.length ? (
                currentDoc.sources.map((source, index) => (
                  <TouchableOpacity
                    key={`${source.url}-${index}`}
                    style={styles.sourceRow}
                    accessibilityRole="link"
                    accessibilityLabel={`Open source ${index + 1}: ${source.title}`}
                    onPress={() => Linking.openURL(source.url).catch(() => {})}
                  >
                    <View style={styles.sourceProviderBadge}>
                      <Text style={styles.sourceProviderText}>{sourceProvider(source.url)}</Text>
                    </View>
                    <Text style={styles.sourceLink} numberOfLines={2}>[{index + 1}] {source.title}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.sectionBody}>{t('research.noSources', lang)}</Text>
              )}
            </View>

            {/* Action Bar */}
            <View style={styles.docActions}>
              <TouchableOpacity
                style={styles.shareBtn}
                accessibilityLabel="Share / export PDF"
                onPress={() => handleShare(currentDoc)}
              >
                <Share2 size={14} color={palette.bgDeep} />
                <Text style={styles.shareBtnText}>{t('research.share', lang)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.openBtn}
                accessibilityLabel="View in PDF viewer"
                onPress={() => handleShare(currentDoc)}
              >
                <ExternalLink size={14} color={palette.accent} />
                <Text style={styles.openBtnText}>{t('research.open', lang)}</Text>
              </TouchableOpacity>
            </View>
          </View>
          </ScreenReveal>
        )}
      </ScrollView>

      {/* Research is reached from the dashboard deck, so the dashboard is the
          active tab here rather than a tab of its own. */}
      <BottomNav active="dashboard" />
    </ParticleBackground>
  );
}
