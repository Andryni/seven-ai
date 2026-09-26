import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bot, BrainCircuit, CheckCircle2, CloudCog, Cpu, LockKeyhole, Play, RefreshCw, Shield, Workflow, XCircle } from 'lucide-react-native';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { BottomNav } from '../src/components/BottomNav';
import { TapScale } from '../src/components/TapScale';
import { FONT } from '../src/theme/typography';
import { useTheme, useThemeStyles, type Palette } from '../src/theme/theme';
import { useSevenStore } from '../src/store/useSevenStore';
import { autonomousCoreService, useAutonomousMissions } from '../src/services/autonomousCoreService';
import { backgroundAutonomyService } from '../src/services/backgroundAutonomyService';
import { localInferenceService } from '../src/services/localInferenceService';
import { encryptedSyncService, type SyncStatus } from '../src/services/encryptedSyncService';
import { proactiveIntelligenceService, type ProactiveSignal } from '../src/services/proactiveIntelligenceService';
import { securityPolicyService } from '../src/services/securityPolicyService';
import { haptics } from '../src/services/hapticsService';

export default function AutonomyScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useThemeStyles(autonomyStyles);
  const config = useSevenStore((state) => state.config);
  const setConfig = useSevenStore((state) => state.setConfig);
  const switchSecurityProfile = useSevenStore((state) => state.switchSecurityProfile);
  const addTerminalLog = useSevenStore((state) => state.addTerminalLog);
  const missions = useAutonomousMissions();
  const [backgroundStatus, setBackgroundStatus] = useState('checking');
  const [localStatus, setLocalStatus] = useState('not tested');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ phase: 'idle', detail: 'Never synchronized.' });
  const [signals, setSignals] = useState<ProactiveSignal[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    backgroundAutonomyService.getStatus().then((value) => setBackgroundStatus(value.registered ? 'registered' : value.available ? 'available' : 'restricted')).catch(() => setBackgroundStatus('unavailable'));
    encryptedSyncService.status().then(setSyncStatus).catch(() => {});
    proactiveIntelligenceService.getSignals().then(setSignals).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toggleBackground = async (enabled: boolean) => {
    const result = await backgroundAutonomyService.setEnabled(enabled);
    await setConfig({ autonomousBackgroundEnabled: result.enabled });
    setBackgroundStatus(result.status);
    addTerminalLog(`AUTONOMOUS BACKGROUND: ${result.status.toUpperCase()}`, result.enabled ? 'success' : 'warn');
  };

  const createMission = () => {
    autonomousCoreService.create({
      title: 'Gideon parallel readiness review', objective: 'Audit intelligence, privacy and delivery readiness in parallel.', maxParallel: 3,
      nodes: [
        { id: 'plan', label: 'Decompose objective', agent: 'GIDEON' },
        { id: 'intel', label: 'Validate intelligence feeds', agent: 'ATHENA', dependencies: ['plan'] },
        { id: 'security', label: 'Review security policy', agent: 'JANUS', dependencies: ['plan'] },
        { id: 'build', label: 'Validate artifact pipeline', agent: 'DAVE', dependencies: ['plan'] },
        { id: 'release', label: 'Approve release recommendation', agent: 'GIDEON', dependencies: ['intel', 'security', 'build'], requiresApproval: true, risk: 'high' },
      ],
    });
    haptics.success();
  };

  const runMission = async (id: string) => {
    setBusy(true);
    try {
      await autonomousCoreService.runReady(id, async (node) => {
        autonomousCoreService.checkpoint(id, node.id, 45, { phase: node.label });
        const result = await localInferenceService.complete(`Return a one-sentence verification for: ${node.label}`);
        return `${result.text} [${result.provider}]`;
      });
    } finally { setBusy(false); }
  };

  const runProactiveScan = async () => {
    setBusy(true);
    try { setSignals(await proactiveIntelligenceService.analyze()); } finally { setBusy(false); }
  };

  const sync = async (direction: 'push' | 'pull') => {
    setBusy(true);
    try {
      if (direction === 'push') {
        const result = await encryptedSyncService.push();
        setSyncStatus(result);
      } else {
        const pulled = await encryptedSyncService.pull();
        setSyncStatus(pulled.status);
        if (pulled.payload) Alert.alert('Verified encrypted snapshot', 'Replace portable sessions, routines, projects and research with the downloaded snapshot?', [
          { text: 'Keep local', style: 'cancel' },
          { text: 'Import', onPress: async () => { await encryptedSyncService.applyPulledPayload(pulled.payload); addTerminalLog('E2EE snapshot imported after explicit approval.', 'success'); } },
        ]);
      }
      haptics.success();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setSyncStatus({ phase: 'error', detail }); Alert.alert('Encrypted sync', detail);
    } finally { setBusy(false); }
  };

  return <ParticleBackground>
    <HudHeader />
    <View style={styles.header}>
      <TapScale style={styles.back} onPress={() => router.back()}><ArrowLeft size={17} color={palette.accent} /></TapScale>
      <View style={styles.headerCopy}><Text style={styles.kicker}>GENERATION 4 // AUTONOMOUS CORE</Text><Text style={styles.title}>MISSION CONTROL</Text></View>
      <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>{backgroundStatus.toUpperCase()}</Text></View>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.hero}><BrainCircuit size={42} color={palette.accent} /><View style={styles.heroCopy}><Text style={styles.heroTitle}>AUTONOMOUS CORE ONLINE</Text><Text style={styles.heroText}>Durable DAG missions, bounded parallel agents, checkpoints, approvals, local inference and encrypted synchronization.</Text></View></View>

      <Section title="ANDROID BACKGROUND FABRIC" icon={<Cpu size={15} color={palette.info} />} styles={styles}>
        <SwitchRow label="OS-budgeted background maintenance" value={config.autonomousBackgroundEnabled === true} onChange={toggleBackground} palette={palette} styles={styles} />
        <Text style={styles.hint}>Android WorkManager schedules maintenance after restart and under battery/network constraints. Continuous wake-word listening still requires a dedicated foreground-service native module.</Text>
        {__DEV__ && <Action label="TRIGGER DEBUG WORKER" onPress={() => backgroundAutonomyService.testNow()} styles={styles} />}
      </Section>

      <Section title="PARALLEL AGENT DAG" icon={<Workflow size={15} color={palette.success} />} styles={styles}>
        <View style={styles.actionRow}><Action label="NEW READINESS MISSION" onPress={createMission} styles={styles} /><Text style={styles.counter}>{missions.length} MISSIONS</Text></View>
        {missions.slice(0, 6).map((mission) => <View key={mission.id} style={styles.mission}>
          <View style={styles.missionTop}><View><Text style={styles.missionTitle}>{mission.title}</Text><Text style={styles.missionState}>{mission.state.toUpperCase()} · {mission.budget.maxParallel} PARALLEL</Text></View><TouchableOpacity disabled={busy} onPress={() => runMission(mission.id)}><Play size={16} color={palette.accent} /></TouchableOpacity></View>
          <View style={styles.nodeRail}>{mission.nodes.map((node) => <TouchableOpacity key={node.id} style={[styles.node, node.state === 'completed' && styles.nodeDone, node.state === 'awaiting_approval' && styles.nodeApproval]} onPress={() => node.state === 'awaiting_approval' && autonomousCoreService.approve(mission.id, node.id)}><Bot size={11} color={node.state === 'completed' ? palette.success : palette.accent} /><Text style={styles.nodeAgent}>{node.agent}</Text><Text style={styles.nodeLabel} numberOfLines={2}>{node.label}</Text><Text style={styles.nodeState}>{node.state.replace('_', ' ').toUpperCase()}</Text></TouchableOpacity>)}</View>
          <View style={styles.actionRow}><Action label={mission.state === 'paused' ? 'RESUME' : 'PAUSE'} onPress={() => mission.state === 'paused' ? autonomousCoreService.resume(mission.id) : autonomousCoreService.pause(mission.id)} styles={styles} /><Action label="CANCEL" onPress={() => autonomousCoreService.cancel(mission.id)} styles={styles} danger /></View>
        </View>)}
      </Section>

      <Section title="LOCAL / OFFLINE BRAIN" icon={<BrainCircuit size={15} color={palette.warning} />} styles={styles}>
        <SwitchRow label="Prefer local OpenAI-compatible runtime" value={config.localInferenceEnabled === true} onChange={(value) => setConfig({ localInferenceEnabled: value })} palette={palette} styles={styles} />
        <Field label="DEVICE ENDPOINT" value={config.localModelEndpoint || ''} placeholder="http://192.168.x.x:11434" onChange={(value) => setConfig({ localModelEndpoint: value })} styles={styles} />
        <Field label="MODEL" value={config.localModelName || ''} placeholder="qwen / llama / gemma" onChange={(value) => setConfig({ localModelName: value })} styles={styles} />
        <Field label="LOCAL ENDPOINT TOKEN" value={config.localModelToken || ''} placeholder="Optional; stored in hardware vault" onChange={(value) => setConfig({ localModelToken: value })} styles={styles} secret />
        <Action label="TEST LOCAL CORE" onPress={async () => { const result = await localInferenceService.health(); setLocalStatus(result.detail); }} styles={styles} />
        <Text style={styles.statusLine}>{localStatus}</Text>
      </Section>

      <Section title="DAVE DELIVERY BRIDGE" icon={<CloudCog size={15} color={palette.info} />} styles={styles}>
        <Field label="GITHUB REPOSITORY" value={config.githubRepository || ''} placeholder="owner/repository" onChange={(value) => setConfig({ githubRepository: value })} styles={styles} />
        <Field label="FINE-GRAINED GITHUB TOKEN" value={config.githubToken || ''} placeholder="Stored in hardware vault" onChange={(value) => setConfig({ githubToken: value })} styles={styles} secret />
        <Text style={styles.hint}>DAVE creates a branch, blobs, commit and pull request. It never merges automatically.</Text>
      </Section>

      <Section title="PROACTIVE INTELLIGENCE" icon={<RefreshCw size={15} color={palette.info} />} styles={styles}>
        <SwitchRow label="Commitments and contextual alerts" value={config.proactiveIntelligenceEnabled !== false} onChange={(value) => setConfig({ proactiveIntelligenceEnabled: value })} palette={palette} styles={styles} />
        <Action label="ANALYZE NOW" onPress={runProactiveScan} styles={styles} />
        {signals.slice(0, 6).map((signal) => <TouchableOpacity key={signal.id} style={styles.signal} onPress={async () => { await proactiveIntelligenceService.dismiss(signal.id); setSignals((current) => current.filter((item) => item.id !== signal.id)); }}><Text style={styles.signalType}>{signal.type.toUpperCase()} · {Math.round(signal.confidence * 100)}%</Text><Text style={styles.signalTitle}>{signal.title}</Text><Text style={styles.signalDetail}>{signal.detail}</Text></TouchableOpacity>)}
      </Section>

      <Section title="SECURITY PROFILES" icon={<Shield size={15} color={palette.error} />} styles={styles}>
        <View style={styles.profileRow}>{securityPolicyService.getProfiles().map((profile) => <TouchableOpacity key={profile.id} style={[styles.profile, config.activeSecurityProfile === profile.id && styles.profileActive]} onPress={() => switchSecurityProfile(profile.id)}><Text style={[styles.profileText, config.activeSecurityProfile === profile.id && styles.profileTextActive]}>{profile.label.toUpperCase()}</Text></TouchableOpacity>)}</View>
        {Object.entries(securityPolicyService.active().capabilities).map(([capability, decision]) => <View key={capability} style={styles.policyLine}><Text style={styles.policyCapability}>{capability.replace('_', ' ').toUpperCase()}</Text><Text style={[styles.policyDecision, decision === 'deny' && { color: palette.error }, decision === 'allow' && { color: palette.success }]}>{decision.toUpperCase()}</Text></View>)}
      </Section>

      <Section title="END-TO-END ENCRYPTED SYNC" icon={<LockKeyhole size={15} color={palette.success} />} styles={styles}>
        <SwitchRow label="Enable user-hosted sync" value={config.syncEnabled === true} onChange={(value) => setConfig({ syncEnabled: value })} palette={palette} styles={styles} />
        <Field label="SYNC ENDPOINT" value={config.syncEndpoint || ''} placeholder="https://your-server.example" onChange={(value) => setConfig({ syncEndpoint: value })} styles={styles} />
        <Field label="SYNC AUTH TOKEN" value={config.syncToken || ''} placeholder="Optional bearer token" onChange={(value) => setConfig({ syncToken: value })} styles={styles} secret />
        <Field label="ENCRYPTION PASSPHRASE" value={config.syncEncryptionKey || ''} placeholder="Stored in hardware vault" onChange={(value) => setConfig({ syncEncryptionKey: value })} styles={styles} secret />
        <View style={styles.actionRow}><Action label="PUSH ENCRYPTED" onPress={() => sync('push')} styles={styles} /><Action label="PULL + VERIFY" onPress={() => sync('pull')} styles={styles} /></View>
        <View style={styles.syncState}>{syncStatus.phase === 'success' ? <CheckCircle2 size={13} color={palette.success} /> : syncStatus.phase === 'error' ? <XCircle size={13} color={palette.error} /> : <CloudCog size={13} color={palette.info} />}<Text style={styles.statusLine}>{syncStatus.detail}</Text></View>
      </Section>
    </ScrollView>
    <BottomNav active="dashboard" />
  </ParticleBackground>;
}

function Section({ title, icon, children, styles }: { title: string; icon: React.ReactNode; children: React.ReactNode; styles: ReturnType<typeof autonomyStyles> }) { return <View style={styles.section}><View style={styles.sectionHead}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>; }
function Action({ label, onPress, styles, danger = false }: { label: string; onPress: () => void | Promise<unknown>; styles: ReturnType<typeof autonomyStyles>; danger?: boolean }) { return <TouchableOpacity style={[styles.action, danger && styles.actionDanger]} onPress={onPress}><Text style={[styles.actionText, danger && styles.actionDangerText]}>{label}</Text></TouchableOpacity>; }
function SwitchRow({ label, value, onChange, palette, styles }: { label: string; value: boolean; onChange: (value: boolean) => void | Promise<void>; palette: Palette; styles: ReturnType<typeof autonomyStyles> }) { return <View style={styles.switchRow}><Text style={styles.switchLabel}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{ false: palette.bgDeep, true: palette.accent }} thumbColor="#fff" /></View>; }
function Field({ label, value, placeholder, onChange, styles, secret = false }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; styles: ReturnType<typeof autonomyStyles>; secret?: boolean }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#607080" autoCapitalize="none" secureTextEntry={secret} /></View>; }

const autonomyStyles = (t: Palette) => ({
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: t.borderStrong, backgroundColor: 'rgba(3,8,16,.97)' }, back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border, borderRadius: 5 }, headerCopy: { flex: 1, marginHorizontal: 10 }, kicker: { color: t.accent, fontFamily: FONT.mono, fontSize: 7, letterSpacing: 1.2 }, title: { color: t.text, fontFamily: FONT.display, fontSize: 17 }, live: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 6 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.success }, liveText: { color: t.success, fontFamily: FONT.monoBold, fontSize: 6 },
  scroll: { flex: 1 }, content: { padding: 12, paddingBottom: 36 }, hero: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 126, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 10, backgroundColor: 'rgba(4,14,25,.95)', padding: 16 }, heroCopy: { flex: 1 }, heroTitle: { color: t.text, fontFamily: FONT.display, fontSize: 15 }, heroText: { color: t.textDim, fontFamily: FONT.ui, fontSize: 10, lineHeight: 15, marginTop: 5 },
  section: { marginTop: 10, borderWidth: 1, borderColor: t.border, borderRadius: 9, backgroundColor: t.bgElevated, padding: 11 }, sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 1, borderBottomColor: t.border, paddingBottom: 8, marginBottom: 8 }, sectionTitle: { color: t.text, fontFamily: FONT.monoBold, fontSize: 9, letterSpacing: .8 }, hint: { color: t.textFaint, fontFamily: FONT.ui, fontSize: 9, lineHeight: 13, marginVertical: 6 },
  switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, switchLabel: { flex: 1, color: t.textDim, fontFamily: FONT.uiMedium, fontSize: 11 }, actionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 }, action: { minHeight: 36, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: t.accentStrong, borderRadius: 5, backgroundColor: t.accentSoft, paddingHorizontal: 10, marginTop: 6 }, actionText: { color: t.accent, fontFamily: FONT.monoBold, fontSize: 7.5 }, actionDanger: { borderColor: t.error }, actionDangerText: { color: t.error }, counter: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 7 },
  mission: { marginTop: 8, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 7, backgroundColor: t.bgDeep, padding: 9 }, missionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, missionTitle: { color: t.text, fontFamily: FONT.uiMedium, fontSize: 11 }, missionState: { color: t.accent, fontFamily: FONT.mono, fontSize: 7, marginTop: 2 }, nodeRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }, node: { width: '31.5%', minHeight: 76, borderWidth: 1, borderColor: t.border, borderRadius: 5, padding: 6 }, nodeDone: { borderColor: t.success, backgroundColor: 'rgba(74,222,128,.06)' }, nodeApproval: { borderColor: t.warning }, nodeAgent: { color: t.accent, fontFamily: FONT.monoBold, fontSize: 6, marginTop: 3 }, nodeLabel: { color: t.textDim, fontFamily: FONT.ui, fontSize: 8, marginTop: 3 }, nodeState: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 5.5, marginTop: 4 },
  field: { marginTop: 8 }, fieldLabel: { color: t.textFaint, fontFamily: FONT.monoBold, fontSize: 7, marginBottom: 4 }, input: { minHeight: 40, borderWidth: 1, borderColor: t.border, borderRadius: 5, backgroundColor: t.bgDeep, color: t.text, fontFamily: FONT.mono, fontSize: 9, paddingHorizontal: 9 }, statusLine: { flex: 1, color: t.textDim, fontFamily: FONT.mono, fontSize: 8, marginTop: 6 },
  signal: { borderLeftWidth: 2, borderLeftColor: t.info, backgroundColor: t.bgDeep, padding: 8, marginTop: 6 }, signalType: { color: t.info, fontFamily: FONT.monoBold, fontSize: 6.5 }, signalTitle: { color: t.text, fontFamily: FONT.uiMedium, fontSize: 10, marginTop: 2 }, signalDetail: { color: t.textDim, fontFamily: FONT.ui, fontSize: 8.5, marginTop: 2 },
  profileRow: { flexDirection: 'row', gap: 6 }, profile: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border, borderRadius: 5 }, profileActive: { borderColor: t.accent, backgroundColor: t.accentSoft }, profileText: { color: t.textFaint, fontFamily: FONT.monoBold, fontSize: 7 }, profileTextActive: { color: t.accent }, policyLine: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: t.border, paddingVertical: 6 }, policyCapability: { color: t.textDim, fontFamily: FONT.mono, fontSize: 7 }, policyDecision: { color: t.warning, fontFamily: FONT.monoBold, fontSize: 7 }, syncState: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
} as const);
