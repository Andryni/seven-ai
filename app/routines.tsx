import React, { useMemo, useState } from 'react';
import { FONT } from '../src/theme/typography';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  Switch,
  Animated,
  PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { BottomNav } from '../src/components/BottomNav';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { routineService } from '../src/services/routineService';
import { haptics } from '../src/services/hapticsService';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { t } from '../src/theme/i18n';
import type { AutomationRoutine, RoutineActionType, RoutineTriggerType } from '../src/types';
import {
  ChevronLeft,
  Clock,
  Plus,
  Trash2,
  Sun,
  FolderSync,
  Mail,
  Search,
  StickyNote,
  X,
  Repeat,
  CalendarClock,
  AlarmClock,
  BatteryWarning,
  CalendarCheck,
  Wifi,
  BellRing,
  GitBranch,
  PlayCircle,
} from 'lucide-react-native';

const TRIGGER_TYPES: RoutineTriggerType[] = [
  'daily',
  'weekly',
  'once',
  'battery_low',
  'calendar_soon',
  'wifi_connect',
];
/** Triggers scheduled ahead of time as OS notifications need an hour/minute
 *  picker; the three conditional triggers are live checks with their own
 *  dedicated field (threshold / lead time / none) instead. */
const TIME_BASED_TRIGGERS: RoutineTriggerType[] = ['daily', 'weekly', 'once'];
const BATTERY_THRESHOLDS = [5, 10, 15, 20, 25, 30, 40, 50];
const CALENDAR_LEAD_MINUTES = [5, 10, 15, 30, 45, 60, 120];
const ACTION_TYPES: RoutineActionType[] = [
  'morning_briefing',
  'organize_files',
  'check_emails',
  'web_search',
  'reminder',
];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
/** Bounded 0-23 / 0-59 chip strips: fast to tap, and impossible to mistype
 * the way a free-text hour field would be. */
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function actionIcon(type: RoutineActionType, color: string, size = 15) {
  switch (type) {
    case 'morning_briefing':
      return <Sun size={size} color={color} />;
    case 'organize_files':
      return <FolderSync size={size} color={color} />;
    case 'check_emails':
      return <Mail size={size} color={color} />;
    case 'web_search':
      return <Search size={size} color={color} />;
    case 'reminder':
    default:
      return <StickyNote size={size} color={color} />;
  }
}

function triggerIcon(type: RoutineTriggerType, color: string, size = 13) {
  switch (type) {
    case 'weekly':
      return <Repeat size={size} color={color} />;
    case 'once':
      return <CalendarClock size={size} color={color} />;
    case 'battery_low':
      return <BatteryWarning size={size} color={color} />;
    case 'calendar_soon':
      return <CalendarCheck size={size} color={color} />;
    case 'wifi_connect':
      return <Wifi size={size} color={color} />;
    case 'daily':
    default:
      return <AlarmClock size={size} color={color} />;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function summarize(routine: AutomationRoutine, lang: 'fr' | 'en'): string {
  const { trigger } = routine;
  if (trigger.type === 'battery_low') {
    return t('routines.summary.batteryLow', lang).replace('{pct}', String(trigger.batteryThreshold ?? 20));
  }
  if (trigger.type === 'calendar_soon') {
    return t('routines.summary.calendarSoon', lang).replace('{minutes}', String(trigger.minutesBefore ?? 15));
  }
  if (trigger.type === 'wifi_connect') {
    return t('routines.summary.wifiConnect', lang);
  }

  const time = `${pad2(trigger.hour ?? 0)}:${pad2(trigger.minute ?? 0)}`;
  if (trigger.type === 'weekly') {
    const weekday = t(`routines.weekday.${trigger.weekday ?? 1}`, lang);
    return t('routines.summary.weekly', lang).replace('{weekday}', weekday).replace('{time}', time);
  }
  if (trigger.type === 'once') {
    return t('routines.summary.once', lang).replace('{date}', trigger.date ?? '?').replace('{time}', time);
  }
  return t('routines.summary.daily', lang).replace('{time}', time);
}

/** Tomorrow, YYYY-MM-DD — a sane, always-valid default for a new one-shot routine. */
function tomorrowIso(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function emptyDraft(): AutomationRoutine {
  return {
    id: `routine-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    trigger: { type: 'daily', hour: 8, minute: 0 },
    action: { type: 'morning_briefing' },
    enabled: true,
    createdAt: Date.now(),
  };
}

export default function RoutinesScreen() {
  const router = useRouter();
  const config = useSevenStore((s) => s.config);
  const routines = useSevenStore((s) => s.automationRoutines);
  const addAutomationRoutine = useSevenStore((s) => s.addAutomationRoutine);
  const updateAutomationRoutine = useSevenStore((s) => s.updateAutomationRoutine);
  const deleteAutomationRoutine = useSevenStore((s) => s.deleteAutomationRoutine);
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);

  const palette = useTheme();
  const styles = useThemeStyles(routinesStyles);
  const lang = (config.language ?? 'en') === 'fr' ? 'fr' : 'en';

  const [editing, setEditing] = useState<AutomationRoutine | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AutomationRoutine | null>(null);
  const [simulationTrace, setSimulationTrace] = useState<string[]>([]);

  const sorted = useMemo(
    () => [...routines].sort((a, b) => b.createdAt - a.createdAt),
    [routines]
  );

  const openNew = () => {
    haptics.light();
    setEditing(emptyDraft());
    setIsNew(true);
    setSaveError(null);
  };

  const openEdit = (routine: AutomationRoutine) => {
    haptics.light();
    setEditing({ ...routine, trigger: { ...routine.trigger }, action: { ...routine.action } });
    setIsNew(false);
    setSaveError(null);
  };

  const closeModal = () => {
    setEditing(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    const name = editing.name.trim() || (lang === 'fr' ? 'Routine sans nom' : 'Untitled routine');
    const validationError = routineService.supported
      ? null
      : null; // trigger validation happens inside scheduleRoutine; surfaced via its result below.
    void validationError;

    setSaving(true);
    const draft: AutomationRoutine = { ...editing, name };
    const result = await routineService.scheduleRoutine(draft, lang);

    if (result === 'invalid') {
      setSaveError(t('routines.status.invalid', lang));
      setSaving(false);
      return;
    }

    if (isNew) {
      addAutomationRoutine(draft);
    } else {
      updateAutomationRoutine(draft.id, draft);
    }

    const statusKey = `routines.status.${result}` as const;
    addTerminalLog(t(statusKey, lang), result === 'scheduled' ? 'success' : 'warn');
    haptics.success();
    setSaving(false);
    setEditing(null);
  };

  const handleToggleEnabled = async (routine: AutomationRoutine) => {
    haptics.light();
    const next = !routine.enabled;
    if (next) {
      const result = await routineService.scheduleRoutine(routine, lang);
      if (result !== 'scheduled') {
        addTerminalLog(t(`routines.status.${result}` as const, lang), 'warn');
        if (result === 'invalid') return;
      }
    } else {
      await routineService.cancelRoutine(routine.id);
    }
    updateAutomationRoutine(routine.id, { enabled: next });
    addTerminalLog(t(next ? 'routines.status.enabled' : 'routines.status.disabled', lang), 'info');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await routineService.cancelRoutine(pendingDelete.id);
    deleteAutomationRoutine(pendingDelete.id);
    addTerminalLog(t('routines.status.deleted', lang), 'info');
    setPendingDelete(null);
  };

  return (
    <ParticleBackground>
      <HudHeader />

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
            <Clock size={15} color={palette.accent} />
            <Text style={styles.titleText}>{t('routines.title', lang)}</Text>
          </View>

          <TouchableOpacity
            style={styles.newBtnCompact}
            accessibilityLabel={t('routines.new', lang)}
            onPress={openNew}
          >
            <Plus size={16} color={palette.bgDeep} />
          </TouchableOpacity>
        </View>
      </ScreenReveal>

      <FlatList
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        data={sorted}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <ScreenReveal index={1}>
            <Text style={styles.subtitle}>{t('routines.subtitle', lang)}</Text>
            {!!simulationTrace.length && (
              <View style={styles.simulationPanel}>
                <Text style={styles.simulationTitle}>ARES // DRY-RUN TRACE</Text>
                {simulationTrace.map((line, index) => <Text key={`${line}-${index}`} style={styles.simulationLine}>{index + 1}. {line}</Text>)}
              </View>
            )}
          </ScreenReveal>
        }
        ListEmptyComponent={
          <ScreenReveal index={2}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('routines.empty', lang)}</Text>
            </View>
          </ScreenReveal>
        }
        renderItem={({ item, index }) => (
          <ScreenReveal index={Math.min(index + 2, 6)}>
            <TouchableOpacity
              style={[styles.card, !item.enabled && styles.cardDisabled]}
              onPress={() => openEdit(item)}
              accessibilityLabel={item.name}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <View style={[styles.iconWrap, { borderColor: palette.accent }]}>
                    {actionIcon(item.action.type, palette.accent)}
                  </View>
                  <View style={styles.cardTextWrap}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.cardMetaRow}>
                      {triggerIcon(item.trigger.type, palette.textDim, 11)}
                      <Text style={styles.cardMeta}>{summarize(item, lang)}</Text>
                    </View>
                    <Text style={styles.cardAction}>
                      {t(`routines.action.${item.action.type}`, lang)}
                      {item.action.payload ? ` — ${item.action.payload}` : ''}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={item.enabled}
                  onValueChange={() => handleToggleEnabled(item)}
                  trackColor={{ false: palette.bgElevated, true: palette.accent }}
                  thumbColor="#FFF"
                />
              </View>
              <View style={styles.graphRail}>
                <View style={styles.graphNode}>
                  {triggerIcon(item.trigger.type, palette.info, 12)}
                  <Text style={styles.graphNodeText}>TRIGGER</Text>
                </View>
                <View style={styles.graphLink}><View style={styles.graphPulse} /></View>
                <View style={styles.graphNode}>
                  <GitBranch size={12} color={palette.warning} />
                  <Text style={styles.graphNodeText}>VALIDATE</Text>
                </View>
                <View style={styles.graphLink}><View style={styles.graphPulse} /></View>
                <View style={styles.graphNode}>
                  {actionIcon(item.action.type, palette.success, 12)}
                  <Text style={styles.graphNodeText}>EXECUTE</Text>
                </View>
                <View style={styles.graphLink}><View style={styles.graphPulse} /></View>
                <View style={styles.graphNode}>
                  <BellRing size={12} color={palette.accent} />
                  <Text style={styles.graphNodeText}>REPORT</Text>
                </View>
              </View>
              <View style={styles.cardBottom}>
                <Text style={styles.cardLastRun}>
                  {item.lastRunAt
                    ? `${t('routines.lastRun', lang)}: ${new Date(item.lastRunAt).toLocaleString()}`
                    : t('routines.never', lang)}
                </Text>
                <TouchableOpacity
                  style={styles.simulateInline}
                  accessibilityLabel="Simulate routine"
                  onPress={() => {
                    const trace = [
                      `TRIGGER: ${summarize(item, lang)}`,
                      `CONDITION: ${item.graph?.conditionExpression || 'always'} → TRUE`,
                      `TRUE BRANCH: ${t(`routines.action.${item.action.type}`, lang)}`,
                      `FALSE BRANCH: ${item.graph?.falseAction ? t(`routines.action.${item.graph.falseAction.type}`, lang) : 'NO-OP'}`,
                      'REPORT: both paths validated; no action executed',
                    ];
                    setSimulationTrace(trace);
                    addTerminalLog(`ROUTINE SIMULATION ${item.name}: ${trace.join(' | ')}`, 'info');
                  }}
                >
                  <PlayCircle size={13} color={palette.info} />
                  <Text style={styles.simulateInlineText}>SIMULATE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel={t('routines.delete', lang)}
                  onPress={() => {
                    haptics.warning();
                    setPendingDelete(item);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={14} color={palette.error} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </ScreenReveal>
        )}
        ListFooterComponent={<View style={{ height: 40 }} />}
      />

      <BottomNav active="dashboard" />

      {/* Create/edit routine */}
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.backdrop}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{isNew ? t('routines.new', lang) : t('routines.edit', lang)}</Text>
              <TouchableOpacity accessibilityLabel={t('common.cancel', lang)} onPress={closeModal}>
                <X size={18} color={palette.textDim} />
              </TouchableOpacity>
            </View>

            {editing && (
              <>
                <TextInput
                  style={styles.nameInput}
                  value={editing.name}
                  onChangeText={(name) => setEditing({ ...editing, name })}
                  placeholder={t('routines.namePlaceholder', lang)}
                  placeholderTextColor={palette.textFaint}
                  maxLength={60}
                />

                <Text style={styles.fieldLabel}>VISUAL ROUTINE GRAPH</Text>
                <RoutineGraphEditor
                  routine={editing}
                  palette={palette}
                  onChange={(graph) => setEditing({ ...editing, graph })}
                />
                <Text style={styles.fieldLabel}>BRANCH CONDITION</Text>
                <TextInput
                  style={styles.nameInput}
                  value={editing.graph?.conditionExpression || ''}
                  onChangeText={(conditionExpression) => setEditing({
                    ...editing,
                    graph: { positions: editing.graph?.positions || {}, ...editing.graph, conditionExpression },
                  })}
                  placeholder={lang === 'fr' ? 'ex. batterie < 20, sinon toujours' : 'e.g. battery < 20, otherwise always'}
                  placeholderTextColor={palette.textFaint}
                />

                <Text style={styles.fieldLabel}>FALSE BRANCH</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, !editing.graph?.falseAction && styles.chipActive]}
                    onPress={() => setEditing({ ...editing, graph: { positions: editing.graph?.positions || {}, conditionExpression: editing.graph?.conditionExpression } })}
                  >
                    <Text style={[styles.chipText, !editing.graph?.falseAction && styles.chipTextActive]}>NO-OP</Text>
                  </TouchableOpacity>
                  {ACTION_TYPES.map((actionType) => (
                    <TouchableOpacity
                      key={`false-${actionType}`}
                      style={[styles.chip, editing.graph?.falseAction?.type === actionType && styles.chipActive]}
                      onPress={() => setEditing({
                        ...editing,
                        graph: { positions: editing.graph?.positions || {}, ...editing.graph, falseAction: { type: actionType } },
                      })}
                    >
                      <Text style={[styles.chipText, editing.graph?.falseAction?.type === actionType && styles.chipTextActive]}>{t(`routines.action.${actionType}`, lang)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.fieldLabel}>{t('routines.trigger', lang)}</Text>
                <View style={styles.chipRow}>
                  {TRIGGER_TYPES.map((tt) => (
                    <TouchableOpacity
                      key={tt}
                      style={[styles.chip, editing.trigger.type === tt && styles.chipActive]}
                      onPress={() =>
                        setEditing({
                          ...editing,
                          trigger:
                            tt === 'weekly'
                              ? {
                                  type: tt,
                                  hour: editing.trigger.hour ?? 8,
                                  minute: editing.trigger.minute ?? 0,
                                  weekday: editing.trigger.weekday ?? 2,
                                }
                              : tt === 'once'
                                ? {
                                    type: tt,
                                    hour: editing.trigger.hour ?? 8,
                                    minute: editing.trigger.minute ?? 0,
                                    date: editing.trigger.date ?? tomorrowIso(),
                                  }
                                : tt === 'battery_low'
                                  ? { type: tt, batteryThreshold: editing.trigger.batteryThreshold ?? 20 }
                                  : tt === 'calendar_soon'
                                    ? { type: tt, minutesBefore: editing.trigger.minutesBefore ?? 15 }
                                    : tt === 'wifi_connect'
                                      ? { type: tt }
                                      : { type: tt, hour: editing.trigger.hour ?? 8, minute: editing.trigger.minute ?? 0 },
                        })
                      }
                    >
                      {triggerIcon(tt, editing.trigger.type === tt ? palette.bgDeep : palette.textDim)}
                      <Text style={[styles.chipText, editing.trigger.type === tt && styles.chipTextActive]}>
                        {t(`routines.trigger.${tt}`, lang)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {editing.trigger.type === 'weekly' && (
                  <>
                    <Text style={styles.fieldLabel}>{t('routines.weekday', lang)}</Text>
                    <View style={styles.chipRow}>
                      {WEEKDAYS.map((wd) => (
                        <TouchableOpacity
                          key={wd}
                          style={[styles.dayChip, editing.trigger.weekday === wd && styles.chipActive]}
                          onPress={() => setEditing({ ...editing, trigger: { ...editing.trigger, weekday: wd } })}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              editing.trigger.weekday === wd && styles.chipTextActive,
                            ]}
                          >
                            {t(`routines.weekday.${wd}`, lang)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {editing.trigger.type === 'once' && (
                  <>
                    <Text style={styles.fieldLabel}>{t('routines.date', lang)}</Text>
                    <TextInput
                      style={styles.nameInput}
                      value={editing.trigger.date ?? ''}
                      onChangeText={(date) => setEditing({ ...editing, trigger: { ...editing.trigger, date } })}
                      placeholder={t('routines.datePlaceholder', lang)}
                      placeholderTextColor={palette.textFaint}
                      autoCorrect={false}
                      maxLength={10}
                    />
                  </>
                )}

                {editing.trigger.type === 'battery_low' && (
                  <>
                    <Text style={styles.fieldLabel}>{t('routines.batteryThreshold', lang)}</Text>
                    <View style={styles.chipRow}>
                      {BATTERY_THRESHOLDS.map((pct) => (
                        <TouchableOpacity
                          key={pct}
                          style={[styles.dayChip, editing.trigger.batteryThreshold === pct && styles.chipActive]}
                          onPress={() =>
                            setEditing({ ...editing, trigger: { ...editing.trigger, batteryThreshold: pct } })
                          }
                        >
                          <Text
                            style={[
                              styles.chipText,
                              editing.trigger.batteryThreshold === pct && styles.chipTextActive,
                            ]}
                          >
                            {pct}%
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {editing.trigger.type === 'calendar_soon' && (
                  <>
                    <Text style={styles.fieldLabel}>{t('routines.leadTime', lang)}</Text>
                    <View style={styles.chipRow}>
                      {CALENDAR_LEAD_MINUTES.map((mins) => (
                        <TouchableOpacity
                          key={mins}
                          style={[styles.dayChip, editing.trigger.minutesBefore === mins && styles.chipActive]}
                          onPress={() =>
                            setEditing({ ...editing, trigger: { ...editing.trigger, minutesBefore: mins } })
                          }
                        >
                          <Text
                            style={[
                              styles.chipText,
                              editing.trigger.minutesBefore === mins && styles.chipTextActive,
                            ]}
                          >
                            {mins}m
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {editing.trigger.type === 'wifi_connect' && (
                  <Text style={styles.fieldHint}>{t('routines.wifiHint', lang)}</Text>
                )}

                {TIME_BASED_TRIGGERS.includes(editing.trigger.type) && (
                  <>
                    <Text style={styles.fieldLabel}>{t('routines.time', lang)}</Text>
                    <View style={styles.timeRow}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
                    <View style={styles.chipRow}>
                      {HOURS.map((h) => (
                        <TouchableOpacity
                          key={h}
                          style={[styles.timeChip, editing.trigger.hour === h && styles.chipActive]}
                          onPress={() => setEditing({ ...editing, trigger: { ...editing.trigger, hour: h } })}
                        >
                          <Text style={[styles.chipText, editing.trigger.hour === h && styles.chipTextActive]}>
                            {pad2(h)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  <Text style={styles.timeColon}>:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
                    <View style={styles.chipRow}>
                      {MINUTES.map((m) => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.timeChip, editing.trigger.minute === m && styles.chipActive]}
                          onPress={() => setEditing({ ...editing, trigger: { ...editing.trigger, minute: m } })}
                        >
                          <Text style={[styles.chipText, editing.trigger.minute === m && styles.chipTextActive]}>
                            {pad2(m)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                    </View>
                  </>
                )}

                <Text style={styles.fieldLabel}>{t('routines.action', lang)}</Text>
                <View style={styles.chipRow}>
                  {ACTION_TYPES.map((at) => (
                    <TouchableOpacity
                      key={at}
                      style={[styles.chip, editing.action.type === at && styles.chipActive]}
                      onPress={() => setEditing({ ...editing, action: { type: at, payload: editing.action.payload } })}
                    >
                      {actionIcon(at, editing.action.type === at ? palette.bgDeep : palette.textDim, 13)}
                      <Text style={[styles.chipText, editing.action.type === at && styles.chipTextActive]}>
                        {t(`routines.action.${at}`, lang)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {(editing.action.type === 'web_search' || editing.action.type === 'reminder') && (
                  <TextInput
                    style={styles.nameInput}
                    value={editing.action.payload ?? ''}
                    onChangeText={(payload) => setEditing({ ...editing, action: { ...editing.action, payload } })}
                    placeholder={t(
                      editing.action.type === 'web_search' ? 'routines.payload.search' : 'routines.payload.reminder',
                      lang
                    )}
                    placeholderTextColor={palette.textFaint}
                  />
                )}

                {saveError && <Text style={styles.errorText}>{saveError}</Text>}

                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  accessibilityLabel={t('routines.save', lang)}
                >
                  <Text style={styles.saveBtnText}>{saving ? '...' : t('routines.save', lang)}</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t('routines.delete', lang)}
        message={pendingDelete ? `${pendingDelete.name} — ${t('routines.deleteConfirm', lang)}` : undefined}
        confirmLabel={lang === 'fr' ? 'SUPPRIMER' : 'DELETE'}
        cancelLabel={t('common.cancel', lang)}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </ParticleBackground>
  );
}

function DraggableRoutineNode({ id, label, initial, color, onMove }: { id: string; label: string; initial: { x: number; y: number }; color: string; onMove: (id: string, position: { x: number; y: number }) => void }) {
  const position = useMemo(() => new Animated.ValueXY({ x: 0, y: 0 }), []);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      position.setValue({ x: 0, y: 0 });
      onMove(id, {
        x: Math.max(0, Math.min(235, initial.x + gesture.dx)),
        y: Math.max(0, Math.min(125, initial.y + gesture.dy)),
      });
    },
  }), [id, initial.x, initial.y, onMove, position]);
  return <Animated.View {...pan.panHandlers} style={[{ position: 'absolute', left: initial.x, top: initial.y, transform: position.getTranslateTransform(), borderColor: color }, graphNodeStyles.node]}><Text style={[graphNodeStyles.text, { color }]}>{label}</Text></Animated.View>;
}

function RoutineGraphEditor({ routine, palette, onChange }: { routine: AutomationRoutine; palette: Palette; onChange: (graph: NonNullable<AutomationRoutine['graph']>) => void }) {
  const defaults: Record<string, { x: number; y: number }> = {
    trigger: { x: 5, y: 55 }, condition: { x: 90, y: 55 }, true: { x: 180, y: 15 }, false: { x: 180, y: 95 }, report: { x: 265, y: 55 },
  };
  const positions = { ...defaults, ...(routine.graph?.positions || {}) };
  const move = (id: string, position: { x: number; y: number }) => onChange({
    positions: { ...positions, [id]: position },
    conditionExpression: routine.graph?.conditionExpression,
    falseAction: routine.graph?.falseAction,
  });
  return <View style={graphNodeStyles.canvas}>
    <View style={[graphNodeStyles.branchLine, { borderColor: palette.borderStrong }]} />
    <Text style={[graphNodeStyles.trueLabel, { color: palette.success }]}>TRUE</Text>
    <Text style={[graphNodeStyles.falseLabel, { color: palette.error }]}>FALSE</Text>
    <DraggableRoutineNode id="trigger" label="TRIGGER" initial={positions.trigger} color={palette.info} onMove={move} />
    <DraggableRoutineNode id="condition" label="IF / ELSE" initial={positions.condition} color={palette.warning} onMove={move} />
    <DraggableRoutineNode id="true" label="ACTION" initial={positions.true} color={palette.success} onMove={move} />
    <DraggableRoutineNode id="false" label="FALLBACK" initial={positions.false} color={palette.error} onMove={move} />
    <DraggableRoutineNode id="report" label="REPORT" initial={positions.report} color={palette.accent} onMove={move} />
  </View>;
}

const graphNodeStyles = {
  canvas: { height: 175, borderWidth: 1, borderColor: 'rgba(0,229,255,.22)', borderRadius: 8, backgroundColor: 'rgba(0,0,0,.3)', overflow: 'hidden' as const, marginBottom: 6 },
  node: { width: 72, height: 36, borderWidth: 1, borderRadius: 5, backgroundColor: 'rgba(4,12,20,.96)', alignItems: 'center' as const, justifyContent: 'center' as const },
  text: { fontFamily: FONT.monoBold, fontSize: 7 },
  branchLine: { position: 'absolute' as const, left: 50, right: 30, top: 73, height: 1, borderTopWidth: 1 },
  trueLabel: { position: 'absolute' as const, left: 155, top: 32, fontFamily: FONT.mono, fontSize: 6 },
  falseLabel: { position: 'absolute' as const, left: 155, top: 117, fontFamily: FONT.mono, fontSize: 6 },
};

const routinesStyles = (t: Palette) =>
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
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    backBtnText: { fontFamily: FONT.mono, color: t.accent, fontSize: 9.5, fontWeight: '700' },
    titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    titleText: { fontFamily: FONT.mono, color: t.text, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    newBtnCompact: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollArea: { flex: 1 },
    scrollContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 40 },
    subtitle: { fontFamily: FONT.mono, color: t.textDim, fontSize: 10, lineHeight: 14, marginBottom: 12 },
    simulationPanel: { borderWidth: 1, borderColor: t.info, borderRadius: 7, backgroundColor: t.accentSoft, padding: 9, marginBottom: 10 },
    simulationTitle: { color: t.info, fontFamily: FONT.monoBold, fontSize: 8, marginBottom: 5 },
    simulationLine: { color: t.textDim, fontFamily: FONT.mono, fontSize: 8, lineHeight: 14 },
    emptyCard: {
      backgroundColor: t.bgElevated,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      padding: 16,
      alignItems: 'center',
    },
    emptyText: { fontFamily: FONT.mono, color: t.textFaint, fontSize: 10, textAlign: 'center', lineHeight: 15 },
    card: {
      backgroundColor: t.bgElevated,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      padding: 12,
      marginBottom: 10,
    },
    cardDisabled: { opacity: 0.55 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTextWrap: { flex: 1 },
    cardName: { fontFamily: FONT.mono, color: t.text, fontSize: 11.5, fontWeight: '800' },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    cardMeta: { fontFamily: FONT.mono, color: t.textDim, fontSize: 9.5 },
    cardAction: { fontFamily: FONT.mono, color: t.accent, fontSize: 9, marginTop: 2 },
    graphRail: { flexDirection: 'row', alignItems: 'center', marginTop: 12, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: t.border, backgroundColor: t.bgDeep },
    graphNode: { width: 47, alignItems: 'center', gap: 3 },
    graphNodeText: { fontFamily: FONT.mono, color: t.textFaint, fontSize: 5.8, fontWeight: '800', letterSpacing: 0.4 },
    graphLink: { flex: 1, height: 1, backgroundColor: t.borderStrong, justifyContent: 'center' },
    graphPulse: { width: 5, height: 5, borderRadius: 3, alignSelf: 'center', backgroundColor: t.accent },
    simulateInline: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: t.info, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 4 },
    simulateInlineText: { color: t.info, fontFamily: FONT.monoBold, fontSize: 6.5 },
    cardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    cardLastRun: { fontFamily: FONT.mono, color: t.textFaint, fontSize: 8.5 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.85)',
      justifyContent: 'center',
      padding: 16,
    },
    modalScroll: { maxHeight: '90%' },
    modalContent: {
      backgroundColor: t.bgElevated,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.borderStrong,
      padding: 16,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    modalTitle: { fontFamily: FONT.mono, color: t.text, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
    nameInput: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 11,
      backgroundColor: t.bgDeep,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 10,
      paddingVertical: 9,
      marginBottom: 12,
    },
    fieldLabel: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    fieldHint: {
      fontFamily: FONT.ui,
      color: t.textDim,
      fontSize: 11,
      lineHeight: 15,
      marginBottom: 12,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bgDeep,
    },
    dayChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bgDeep,
    },
    chipActive: { backgroundColor: t.accent, borderColor: t.accent },
    chipText: { fontFamily: FONT.mono, color: t.textDim, fontSize: 9.5, fontWeight: '700' },
    chipTextActive: { color: t.bgDeep },
    timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    timeScroll: { maxWidth: 130 },
    timeColon: { fontFamily: FONT.mono, color: t.text, fontSize: 14, fontWeight: '800', marginHorizontal: 4 },
    timeChip: {
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bgDeep,
      marginRight: 6,
    },
    errorText: { fontFamily: FONT.mono, color: t.error, fontSize: 9.5, marginBottom: 10 },
    saveBtn: {
      backgroundColor: t.accent,
      borderRadius: 6,
      paddingVertical: 11,
      alignItems: 'center',
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { fontFamily: FONT.mono, color: t.bgDeep, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  } as const);
