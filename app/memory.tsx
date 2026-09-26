import React, { useCallback, useMemo, useState } from 'react';
import { FONT } from '../src/theme/typography';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { BottomNav } from '../src/components/BottomNav';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { memoryService } from '../src/services/memoryService';
import type { MemoryFact } from '../src/services/memoryService';
import { haptics } from '../src/services/hapticsService';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { t } from '../src/theme/i18n';
import {
  ChevronLeft,
  Brain,
  Plus,
  Trash2,
  Pencil,
  X,
  Search,
  Heart,
  User,
  Briefcase,
  Lightbulb,
  AlertTriangle,
  Link2,
  ShieldCheck,
} from 'lucide-react-native';

const CATEGORIES: MemoryFact['category'][] = ['fact', 'preference', 'personal', 'project'];

function categoryIcon(category: MemoryFact['category'], color: string, size = 13) {
  switch (category) {
    case 'preference':
      return <Heart size={size} color={color} />;
    case 'personal':
      return <User size={size} color={color} />;
    case 'project':
      return <Briefcase size={size} color={color} />;
    case 'fact':
    default:
      return <Lightbulb size={size} color={color} />;
  }
}

/** "3 memories" / "1 memory" — the count line under the search bar. */
function countLabel(count: number, lang: 'fr' | 'en'): string {
  const key = count === 1 ? 'memory.count.one' : 'memory.count.other';
  return t(key, lang).replace('{count}', String(count));
}

export default function MemoryScreen() {
  const router = useRouter();
  const config = useSevenStore((s) => s.config);
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);

  const palette = useTheme();
  const styles = useThemeStyles(memoryStyles);
  const lang = (config.language ?? 'en') === 'fr' ? 'fr' : 'en';

  const [facts, setFacts] = useState<MemoryFact[]>([]);
  // Starts true so the empty-state card never flashes before the very
  // first load resolves; a focus-triggered reload afterwards just swaps
  // the list in place without re-showing a loading gate.
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [addCategory, setAddCategory] = useState<MemoryFact['category']>('fact');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<MemoryFact | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editCategory, setEditCategory] = useState<MemoryFact['category']>('fact');

  const [pendingDelete, setPendingDelete] = useState<MemoryFact | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // The RAG store lives in a JSON file, not the Zustand store (see
  // memoryService), so it has to be (re-)loaded explicitly rather than
  // subscribed to — and reloaded every time this screen regains focus, since
  // `remember_fact`/`forget_memory` from chat can change it while the user
  // was elsewhere in the app.
  const loadFacts = useCallback(async () => {
    setLoading(true);
    const all = await memoryService.getAllFacts();
    setFacts(all.sort((a, b) => b.updatedAt - a.updatedAt));
    setLoading(false);
  }, []);

  // `useFocusEffect` already fires once on the very first mount (expo-router
  // runs the callback immediately if the screen is already focused), so a
  // separate mount-only useEffect would just duplicate that first load —
  // this single hook covers both "opened fresh" and "came back to this tab
  // after remember_fact/forget_memory ran elsewhere".
  useFocusEffect(
    useCallback(() => {
      loadFacts();
    }, [loadFacts])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return facts;
    return facts.filter((f) => f.content.toLowerCase().includes(q));
  }, [facts, query]);

  const openAdd = () => {
    haptics.light();
    setAddDraft('');
    setAddCategory('fact');
    setAddOpen(true);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddDraft('');
  };

  const handleAdd = async () => {
    const content = addDraft.trim();
    if (!content) return;
    setSaving(true);
    await memoryService.rememberFact(content, addCategory);
    await loadFacts();
    addTerminalLog(t('memory.status.added', lang), 'success');
    haptics.success();
    setSaving(false);
    closeAdd();
  };

  const openEdit = (fact: MemoryFact) => {
    haptics.light();
    setEditing(fact);
    setEditDraft(fact.content);
    setEditCategory(fact.category);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditDraft('');
  };

  const handleEditSave = async () => {
    if (!editing) return;
    const content = editDraft.trim();
    if (!content) return;
    setSaving(true);
    await memoryService.updateFact(editing.id, { content, category: editCategory });
    await loadFacts();
    addTerminalLog(t('memory.status.updated', lang), 'success');
    haptics.success();
    setSaving(false);
    closeEdit();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await memoryService.deleteFact(pendingDelete.id);
    await loadFacts();
    addTerminalLog(t('memory.status.deleted', lang), 'info');
    haptics.warning();
    setPendingDelete(null);
  };

  const confirmDeleteAll = async () => {
    await memoryService.clearMemory();
    await loadFacts();
    addTerminalLog(t('memory.status.clearedAll', lang), 'warn');
    haptics.warning();
    setConfirmClearAll(false);
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
            <Brain size={15} color={palette.accent} />
            <Text style={styles.titleText}>{t('memory.title', lang)}</Text>
          </View>

          <TouchableOpacity style={styles.newBtnCompact} accessibilityLabel={t('memory.new', lang)} onPress={openAdd}>
            <Plus size={16} color={palette.bgDeep} />
          </TouchableOpacity>
        </View>
      </ScreenReveal>

      <FlatList
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        data={filtered}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={
          <ScreenReveal index={1}>
            <Text style={styles.subtitle}>{t('memory.subtitle', lang)}</Text>
            <View style={styles.cognitiveMap}>
              <View style={styles.memoryCore}><Brain size={24} color={palette.accent} /><Text style={styles.memoryCoreCount}>{facts.length}</Text></View>
              {CATEGORIES.map((category, index) => {
                const count = facts.filter((fact) => fact.category === category).length;
                return (
                  <View key={category} style={[styles.memoryNode, [styles.memoryNode0, styles.memoryNode1, styles.memoryNode2, styles.memoryNode3][index]]}>
                    {categoryIcon(category, palette.accent, 12)}
                    <Text style={styles.memoryNodeLabel}>{category.toUpperCase()}</Text>
                    <Text style={styles.memoryNodeCount}>{count}</Text>
                  </View>
                );
              })}
              <View style={[styles.memoryLink, styles.memoryLinkH]} />
              <View style={[styles.memoryLink, styles.memoryLinkV]} />
            </View>
            <View style={styles.searchRow}>
              <Search size={13} color={palette.textFaint} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={t('memory.search', lang)}
                placeholderTextColor={palette.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity accessibilityLabel={t('common.cancel', lang)} onPress={() => setQuery('')}>
                  <X size={13} color={palette.textFaint} />
                </TouchableOpacity>
              )}
            </View>
            {!loading && facts.length > 0 && (
              <View style={styles.countRow}>
                <Text style={styles.countText}>{countLabel(filtered.length, lang)}</Text>
                <TouchableOpacity
                  style={styles.clearAllBtn}
                  accessibilityLabel={t('memory.deleteAll', lang)}
                  onPress={() => {
                    haptics.warning();
                    setConfirmClearAll(true);
                  }}
                >
                  <AlertTriangle size={11} color={palette.error} />
                  <Text style={styles.clearAllText}>{t('memory.deleteAll', lang)}</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScreenReveal>
        }
        ListEmptyComponent={
          !loading ? (
            <ScreenReveal index={2}>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {facts.length === 0 ? t('memory.empty', lang) : t('memory.noResults', lang)}
                </Text>
              </View>
            </ScreenReveal>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ScreenReveal index={Math.min(index + 2, 6)}>
            <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} accessibilityLabel={item.content}>
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, { borderColor: palette.accent }]}>
                  {categoryIcon(item.category, palette.accent)}
                </View>
                <View style={styles.cardTextWrap}>
                  <Text style={styles.cardContent}>{item.content}</Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardCategory}>{t(`memory.category.${item.category}`, lang)}</Text>
                    <Text style={styles.cardMeta}>
                      {t('memory.updatedAt', lang)}: {new Date(item.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.cognitiveMeta}>
                    <View style={styles.cognitivePill}><ShieldCheck size={9} color={palette.success} /><Text style={styles.cognitivePillText}>{Math.round((item.confidence ?? 1) * 100)}% CONF</Text></View>
                    <View style={styles.cognitivePill}><Text style={styles.cognitivePillText}>IMP {Math.round((item.importance ?? .6) * 100)}</Text></View>
                    <View style={styles.cognitivePill}><Text style={styles.cognitivePillText}>{(item.source || 'user').toUpperCase()}</Text></View>
                    <TouchableOpacity
                      style={styles.cognitivePill}
                      onPress={() => {
                        const related = new Set(item.relatedIds || []);
                        setQuery(related.size ? facts.filter((fact) => related.has(fact.id)).map((fact) => fact.content.split(' ')[0]).join(' ') : item.content.split(' ')[0]);
                      }}
                    >
                      <Link2 size={9} color={palette.accent} /><Text style={styles.cognitivePillText}>{item.relatedIds?.length || 0} LINKS</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View style={styles.cardBottom}>
                <TouchableOpacity
                  style={styles.cardIconBtn}
                  accessibilityLabel={t('memory.edit', lang)}
                  onPress={() => openEdit(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Pencil size={13} color={palette.textDim} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cardIconBtn}
                  accessibilityLabel={t('memory.delete', lang)}
                  onPress={() => {
                    haptics.warning();
                    setPendingDelete(item);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={13} color={palette.error} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </ScreenReveal>
        )}
        ListFooterComponent={<View style={{ height: 40 }} />}
      />

      <BottomNav active="dashboard" />

      {/* Add a new memory */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAdd}>
        <View style={styles.backdrop}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{t('memory.new', lang)}</Text>
              <TouchableOpacity accessibilityLabel={t('common.cancel', lang)} onPress={closeAdd}>
                <X size={18} color={palette.textDim} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={addDraft}
              onChangeText={setAddDraft}
              placeholder={t('memory.addPlaceholder', lang)}
              placeholderTextColor={palette.textFaint}
              multiline
              maxLength={500}
            />

            <Text style={styles.fieldLabel}>{t('memory.category', lang)}</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, addCategory === cat && styles.chipActive]}
                  onPress={() => setAddCategory(cat)}
                >
                  {categoryIcon(cat, addCategory === cat ? palette.bgDeep : palette.textDim)}
                  <Text style={[styles.chipText, addCategory === cat && styles.chipTextActive]}>
                    {t(`memory.category.${cat}`, lang)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, (saving || !addDraft.trim()) && styles.saveBtnDisabled]}
              onPress={handleAdd}
              disabled={saving || !addDraft.trim()}
              accessibilityLabel={t('memory.add', lang)}
            >
              <Text style={styles.saveBtnText}>{t('memory.add', lang)}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit an existing memory */}
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.backdrop}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{t('memory.edit', lang)}</Text>
              <TouchableOpacity accessibilityLabel={t('common.cancel', lang)} onPress={closeEdit}>
                <X size={18} color={palette.textDim} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={editDraft}
              onChangeText={setEditDraft}
              placeholder={t('memory.editPlaceholder', lang)}
              placeholderTextColor={palette.textFaint}
              multiline
              maxLength={500}
            />

            <Text style={styles.fieldLabel}>{t('memory.category', lang)}</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, editCategory === cat && styles.chipActive]}
                  onPress={() => setEditCategory(cat)}
                >
                  {categoryIcon(cat, editCategory === cat ? palette.bgDeep : palette.textDim)}
                  <Text style={[styles.chipText, editCategory === cat && styles.chipTextActive]}>
                    {t(`memory.category.${cat}`, lang)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, (saving || !editDraft.trim()) && styles.saveBtnDisabled]}
              onPress={handleEditSave}
              disabled={saving || !editDraft.trim()}
              accessibilityLabel={t('memory.save', lang)}
            >
              <Text style={styles.saveBtnText}>{t('memory.save', lang)}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t('memory.delete', lang)}
        message={pendingDelete ? `"${pendingDelete.content}" — ${t('memory.deleteConfirm', lang)}` : undefined}
        confirmLabel={t('memory.delete', lang)}
        cancelLabel={t('memory.cancel', lang)}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        visible={confirmClearAll}
        title={t('memory.deleteAllConfirmTitle', lang)}
        message={t('memory.deleteAllConfirm', lang)}
        confirmLabel={t('memory.deleteAll', lang)}
        cancelLabel={t('memory.cancel', lang)}
        destructive
        onConfirm={confirmDeleteAll}
        onCancel={() => setConfirmClearAll(false)}
      />
    </ParticleBackground>
  );
}

const memoryStyles = (t: Palette) => ({
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
  cognitiveMap: { height: 190, marginBottom: 12, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 10, backgroundColor: 'rgba(3,9,18,.92)', position: 'relative', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  memoryCore: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: t.accent, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  memoryCoreCount: { color: t.text, fontFamily: FONT.display, fontSize: 12, marginTop: 2 },
  memoryNode: { position: 'absolute', width: 72, minHeight: 46, borderWidth: 1, borderColor: t.border, borderRadius: 7, backgroundColor: t.bgDeep, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  memoryNode0: { left: 10, top: 15 }, memoryNode1: { right: 10, top: 15 }, memoryNode2: { left: 10, bottom: 15 }, memoryNode3: { right: 10, bottom: 15 },
  memoryNodeLabel: { color: t.textDim, fontFamily: FONT.mono, fontSize: 5.8, marginTop: 2 },
  memoryNodeCount: { position: 'absolute', right: 5, top: 4, color: t.accent, fontFamily: FONT.display, fontSize: 8 },
  memoryLink: { position: 'absolute', backgroundColor: t.borderStrong, opacity: .7 },
  memoryLinkH: { left: 45, right: 45, top: '50%', height: 1 },
  memoryLinkV: { top: 38, bottom: 38, left: '50%', width: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: t.bgElevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontFamily: FONT.mono, color: t.text, fontSize: 11, padding: 0 },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  countText: { fontFamily: FONT.mono, color: t.textFaint, fontSize: 9.5 },
  clearAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearAllText: { fontFamily: FONT.mono, color: t.error, fontSize: 9, fontWeight: '700' },
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
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextWrap: { flex: 1 },
  cardContent: { fontFamily: FONT.ui, color: t.text, fontSize: 12, lineHeight: 17 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  cognitiveMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 7 },
  cognitivePill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: t.border, borderRadius: 10, backgroundColor: t.accentSoft, paddingHorizontal: 6, paddingVertical: 3 },
  cognitivePillText: { color: t.textDim, fontFamily: FONT.monoBold, fontSize: 6.5 },
  cardCategory: { fontFamily: FONT.mono, color: t.accent, fontSize: 8.5, fontWeight: '700', letterSpacing: 0.4 },
  cardMeta: { fontFamily: FONT.mono, color: t.textFaint, fontSize: 8.5 },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  cardIconBtn: { padding: 2 },
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
  textInput: {
    fontFamily: FONT.ui,
    color: t.text,
    fontSize: 12,
    backgroundColor: t.bgDeep,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 12,
  },
  multilineInput: { minHeight: 90, textAlignVertical: 'top' },
  fieldLabel: {
    fontFamily: FONT.mono,
    color: t.accent,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
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
  chipActive: { backgroundColor: t.accent, borderColor: t.accent },
  chipText: { fontFamily: FONT.mono, color: t.textDim, fontSize: 9.5, fontWeight: '700' },
  chipTextActive: { color: t.bgDeep },
  saveBtn: {
    backgroundColor: t.accent,
    borderRadius: 6,
    paddingVertical: 11,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: FONT.mono, color: t.bgDeep, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
} as const);
