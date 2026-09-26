import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Activity, ArrowLeft, Bot, CheckCircle2, Clock3, FileSearch, Orbit, RotateCw, ShieldAlert, Workflow } from 'lucide-react-native';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { BottomNav } from '../src/components/BottomNav';
import { TapScale } from '../src/components/TapScale';
import { useSevenStore } from '../src/store/useSevenStore';
import { useTheme, useThemeStyles, type Palette } from '../src/theme/theme';
import { FONT } from '../src/theme/typography';

export default function OperationsScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useThemeStyles(operationStyles);
  const status = useSevenStore((s) => s.status);
  const logs = useSevenStore((s) => s.terminalLogs);
  const routines = useSevenStore((s) => s.automationRoutines);
  const projects = useSevenStore((s) => s.daveProjects);
  const research = useSevenStore((s) => s.researchDocs);
  const patches = useSevenStore((s) => s.patchLogs);
  const activeRoutines = routines.filter((routine) => routine.enabled);

  return (
    <ParticleBackground>
      <View style={styles.header}>
        <TapScale style={styles.back} onPress={() => router.back()} accessibilityLabel="Back"><ArrowLeft size={17} color={palette.accent} /></TapScale>
        <View style={styles.headerCopy}><Text style={styles.kicker}>SEVEN // AUTONOMOUS EXECUTION FABRIC</Text><Text style={styles.title}>OPERATIONS NEXUS</Text></View>
        <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>{status.toUpperCase()}</Text></View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.core}><Orbit size={42} color={palette.accent} /><View style={styles.coreDot} /></View>
          <View style={styles.heroCopy}><Text style={styles.heroCode}>CORE STATE // {status.toUpperCase()}</Text><Text style={styles.heroTitle}>{status === 'idle' ? 'ALL SYSTEMS STANDING BY' : 'OPERATION IN PROGRESS'}</Text><Text style={styles.heroSub}>Every autonomous action, artifact and recovery signal is exposed in this control plane.</Text></View>
        </View>

        <View style={styles.metrics}>
          <Metric icon={<Workflow size={15} color={palette.info} />} value={String(activeRoutines.length)} label="ARMED ROUTINES" styles={styles} />
          <Metric icon={<Bot size={15} color={palette.success} />} value={String(projects.length)} label="BUILDS" styles={styles} />
          <Metric icon={<FileSearch size={15} color={palette.warning} />} value={String(research.length)} label="RESEARCH" styles={styles} />
          <Metric icon={<ShieldAlert size={15} color={palette.error} />} value={String(patches.length)} label="PATCHES" styles={styles} />
        </View>

        <Text style={styles.sectionLabel}>CONTROL SURFACES</Text>
        <View style={styles.controlGrid}>
          <Control icon={<Workflow size={18} color={palette.info} />} title="AUTOMATION GRAPH" detail={`${activeRoutines.length} active routines`} onPress={() => router.push('/routines')} styles={styles} />
          <Control icon={<FileSearch size={18} color={palette.warning} />} title="RESEARCH LAB" detail={`${research.length} compiled dossiers`} onPress={() => router.push('/research')} styles={styles} />
          <Control icon={<Bot size={18} color={palette.success} />} title="DAVE FORGE" detail={`${projects.length} generated projects`} onPress={() => router.push('/dave')} styles={styles} />
          <Control icon={<ShieldAlert size={18} color={palette.error} />} title="HEALING MATRIX" detail={`${patches.length} recovery records`} onPress={() => router.push('/settings')} styles={styles} />
        </View>

        <View style={styles.logHeader}><View style={styles.logTitleRow}><Activity size={13} color={palette.accent} /><Text style={styles.logTitle}>KERNEL EVENT STREAM</Text></View><Text style={styles.logCount}>{logs.length} RECORDS</Text></View>
        <View style={styles.timeline}>
          {logs.slice(0, 30).map((log, index) => {
            const color = log.type === 'error' ? palette.error : log.type === 'warn' ? palette.warning : log.type === 'success' ? palette.success : palette.accent;
            return <View key={log.id} style={styles.event}><View style={styles.eventRail}><View style={[styles.eventNode, { borderColor: color, backgroundColor: `${color}22` }]}>{log.type === 'success' ? <CheckCircle2 size={10} color={color} /> : log.type === 'cmd' ? <RotateCw size={10} color={color} /> : <Clock3 size={10} color={color} />}</View>{index < Math.min(logs.length, 30) - 1 && <View style={styles.eventLine} />}</View><View style={styles.eventBody}><View style={styles.eventMeta}><Text style={[styles.eventType, { color }]}>{log.type.toUpperCase()}</Text><Text style={styles.eventTime}>{log.timestamp}</Text></View><Text style={styles.eventText}>{log.text}</Text></View></View>;
          })}
        </View>
      </ScrollView>
      <BottomNav active="dashboard" />
    </ParticleBackground>
  );
}

function Metric({ icon, value, label, styles }: { icon: React.ReactNode; value: string; label: string; styles: ReturnType<typeof operationStyles> }) { return <View style={styles.metric}><View style={styles.metricIcon}>{icon}</View><Text style={styles.metricValue}>{value.padStart(2, '0')}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Control({ icon, title, detail, onPress, styles }: { icon: React.ReactNode; title: string; detail: string; onPress: () => void; styles: ReturnType<typeof operationStyles> }) { return <TapScale style={styles.control} onPress={onPress} scaleTo={0.97}><View style={styles.controlIcon}>{icon}</View><Text style={styles.controlTitle}>{title}</Text><Text style={styles.controlDetail}>{detail}</Text></TapScale>; }

const operationStyles = (t: Palette) => ({
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: t.borderStrong, backgroundColor: 'rgba(3,8,16,.96)' }, back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border, borderRadius: 5 }, headerCopy: { flex: 1, marginHorizontal: 10 }, kicker: { color: t.accent, fontFamily: FONT.mono, fontSize: 7.5, letterSpacing: 1.2 }, title: { color: t.text, fontFamily: FONT.display, fontSize: 17, letterSpacing: 1.2 }, live: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: t.border, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.success }, liveText: { color: t.success, fontFamily: FONT.mono, fontSize: 7, fontWeight: '800' },
  scroll: { flex: 1 }, content: { padding: 14, paddingBottom: 30 }, hero: { minHeight: 145, flexDirection: 'row', alignItems: 'center', padding: 16, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 12, backgroundColor: 'rgba(5,15,27,.93)' }, core: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, borderStyle: 'dashed', borderColor: t.accentStrong, alignItems: 'center', justifyContent: 'center' }, coreDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, right: 5, top: 18, backgroundColor: t.success }, heroCopy: { flex: 1, marginLeft: 16 }, heroCode: { color: t.accent, fontFamily: FONT.mono, fontSize: 7.5 }, heroTitle: { color: t.text, fontFamily: FONT.display, fontSize: 16, lineHeight: 20, marginVertical: 6 }, heroSub: { color: t.textDim, fontFamily: FONT.ui, fontSize: 9, lineHeight: 13 },
  metrics: { flexDirection: 'row', gap: 6, marginTop: 8 }, metric: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: t.border, borderRadius: 7, backgroundColor: t.accentSoft, paddingVertical: 9 }, metricIcon: { height: 19 }, metricValue: { color: t.text, fontFamily: FONT.display, fontSize: 16 }, metricLabel: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 5.8, marginTop: 2 },
  sectionLabel: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 8, letterSpacing: 1.5, marginTop: 18, marginBottom: 7 }, controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, control: { width: '48.8%', minHeight: 108, borderWidth: 1, borderColor: t.border, borderRadius: 8, backgroundColor: 'rgba(6,12,22,.9)', padding: 11 }, controlIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }, controlTitle: { color: t.text, fontFamily: FONT.display, fontSize: 9, marginTop: 9 }, controlDetail: { color: t.textDim, fontFamily: FONT.ui, fontSize: 8, marginTop: 4 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 19, marginBottom: 8 }, logTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, logTitle: { color: t.text, fontFamily: FONT.display, fontSize: 10 }, logCount: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 7 }, timeline: { borderWidth: 1, borderColor: t.border, borderRadius: 9, backgroundColor: 'rgba(2,5,10,.86)', padding: 10 }, event: { flexDirection: 'row', minHeight: 58 }, eventRail: { width: 28, alignItems: 'center' }, eventNode: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, eventLine: { flex: 1, width: 1, backgroundColor: t.border }, eventBody: { flex: 1, paddingBottom: 10 }, eventMeta: { flexDirection: 'row', justifyContent: 'space-between' }, eventType: { fontFamily: FONT.mono, fontSize: 7, fontWeight: '900' }, eventTime: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 6.5 }, eventText: { color: t.textDim, fontFamily: FONT.ui, fontSize: 9, lineHeight: 13, marginTop: 4 },
} as const);
