import React, { useState } from 'react';
import { FONT } from '../src/theme/typography';
import {
  View,
  Text,
  StyleSheet,
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
import { BottomNav } from '../src/components/BottomNav';
import { researchService } from '../src/services/researchService';
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
} from 'lucide-react-native';

const PRESET_TOPICS = [
  'research on AI and create a PDF',
  'Autonomous Agents & AST Self-Healing Architecture',
  'Quantum Computing & Post-Quantum Cryptography',
  'Edge Neural Processing on Android 15',
];

export default function ResearchScreen() {
  const router = useRouter();
  const researchDocs = useSevenStore((s) => s.researchDocs);
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);

  const [topic, setTopic] = useState('research on AI and create a PDF');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [activeDoc, setActiveDoc] = useState<ResearchDocument | null>(
    researchDocs.length > 0 ? researchDocs[0] : null
  );

  const handleResearch = async (overrideTopic?: string) => {
    const active = overrideTopic || topic;
    if (!active.trim() || isSynthesizing) return;

    setIsSynthesizing(true);
    try {
      const doc = await researchService.researchTopicAndCreatePdf(active);
      setActiveDoc(doc);
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
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/')}>
          <ChevronLeft size={16} color="#FFD700" />
          <Text style={styles.backBtnText}>DASHBOARD</Text>
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <FileText size={15} color="#FFD700" />
          <Text style={styles.titleText}>RESEARCH TO PDF COMPILER</Text>
        </View>

        <View style={styles.placeholderRight} />
      </View>
      </ScreenReveal>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Topic Input Deck */}
        <ScreenReveal index={1}>
        <View style={styles.inputDeck}>
          <View style={styles.labelRow}>
            <Sparkles size={13} color="#FFD700" />
            <Text style={styles.deckLabel}>INTELLIGENCE RESEARCH DIRECTIVE</Text>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. research on AI and create a PDF"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
            <TouchableOpacity
              style={[styles.compileBtn, isSynthesizing && styles.btnLoading]}
              onPress={() => handleResearch()}
              disabled={isSynthesizing}
            >
              <Play size={14} color="#050508" />
              <Text style={styles.compileText}>
                {isSynthesizing ? 'COMPILING...' : 'GENERATE PDF'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Preset Topics */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presetScroll}
            contentContainerStyle={styles.presetContainer}
          >
            {PRESET_TOPICS.map((p, i) => (
              <TouchableOpacity
                key={i}
                style={styles.presetChip}
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
                <BookOpen size={16} color="#FFD700" />
                <View>
                  <Text style={styles.docTitleText}>{currentDoc.title}</Text>
                  <Text style={styles.docMetaText}>
                    Topic: {currentDoc.topic} • Generated: {new Date(currentDoc.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
              </View>

              <View style={styles.pdfReadyBadge}>
                <CheckCircle2 size={11} color="#00FFA3" />
                <Text style={styles.pdfReadyText}>PDF COMPILED</Text>
              </View>
            </View>

            {/* Document Executive Summary */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>EXECUTIVE BRIEFING SUMMARY</Text>
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

            {/* Action Bar */}
            <View style={styles.docActions}>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => handleShare(currentDoc)}
              >
                <Share2 size={14} color="#050508" />
                <Text style={styles.shareBtnText}>SHARE / EXPORT PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.openBtn}
                onPress={() => handleShare(currentDoc)}
              >
                <ExternalLink size={14} color="#FFD700" />
                <Text style={styles.openBtnText}>VIEW IN PDF VIEWER</Text>
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

const styles = StyleSheet.create({
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(5, 5, 8, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 215, 0, 0.2)',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  backBtnText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
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
    color: '#FFF',
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
  inputDeck: {
    backgroundColor: 'rgba(10, 10, 16, 0.9)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.35)',
    padding: 12,
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  deckLabel: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#FFF',
    fontFamily: FONT.mono,
    fontSize: 11.5,
  },
  compileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    borderRadius: 4,
    gap: 5,
  },
  btnLoading: {
    opacity: 0.6,
  },
  compileText: {
    fontFamily: FONT.mono,
    color: '#050508',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  presetScroll: {
    marginTop: 10,
  },
  presetContainer: {
    gap: 6,
  },
  presetChip: {
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
  },
  presetText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 9.5,
  },
  docCard: {
    backgroundColor: 'rgba(10, 10, 16, 0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    padding: 14,
    marginTop: 10,
  },
  docCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  docHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  docTitleText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  docMetaText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 8.5,
    marginTop: 2,
  },
  pdfReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 255, 163, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#00FFA3',
  },
  pdfReadyText: {
    fontFamily: FONT.mono,
    color: '#00FFA3',
    fontSize: 8.5,
    fontWeight: '800',
  },
  summaryBox: {
    backgroundColor: 'rgba(0, 229, 255, 0.06)',
    borderLeftWidth: 3,
    borderLeftColor: '#00E5FF',
    padding: 10,
    borderRadius: 4,
    marginBottom: 12,
  },
  summaryLabel: {
    fontFamily: FONT.mono,
    color: '#00E5FF',
    fontSize: 9.5,
    fontWeight: '800',
    marginBottom: 4,
  },
  summaryBody: {
    fontFamily: FONT.mono,
    color: '#E0F7FA',
    fontSize: 10.5,
    lineHeight: 15,
  },
  sectionsList: {
    gap: 10,
    marginBottom: 14,
  },
  sectionItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionHeading: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionBody: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    lineHeight: 14,
  },
  docActions: {
    flexDirection: 'row',
    gap: 10,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    paddingVertical: 9,
    borderRadius: 4,
    gap: 6,
  },
  shareBtnText: {
    fontFamily: FONT.mono,
    color: '#050508',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  openBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#FFD700',
    paddingVertical: 9,
    borderRadius: 4,
    gap: 6,
  },
  openBtnText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
