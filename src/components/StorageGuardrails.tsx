import React from 'react';
import { View, Text } from 'react-native';
import { Database, MessagesSquare, Workflow } from 'lucide-react-native';
import { useTheme, useThemeStyles, type Palette } from '../theme/theme';
import { FONT } from '../theme/typography';

interface Props {
  language: 'en' | 'fr';
  messages: number;
  sessions: number;
  routines: number;
}

const limits = { messages: 300, sessions: 100, routines: 100 };

export function StorageGuardrails({ language, messages, sessions, routines }: Props) {
  const palette = useTheme();
  const styles = useThemeStyles(createStyles);
  const rows = [
    { label: language === 'fr' ? 'Messages actifs' : 'Active messages', value: messages, max: limits.messages, icon: MessagesSquare },
    { label: language === 'fr' ? 'Conversations' : 'Conversations', value: sessions, max: limits.sessions, icon: Database },
    { label: language === 'fr' ? 'Routines' : 'Routines', value: routines, max: limits.routines, icon: Workflow },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{language === 'fr' ? 'GARDE-FOUS LOCAUX' : 'LOCAL GUARDRAILS'}</Text>
      <Text style={styles.title}>{language === 'fr' ? 'UTILISATION DU STOCKAGE' : 'STORAGE USAGE'}</Text>
      <Text style={styles.description}>
        {language === 'fr'
          ? 'Les éléments les plus anciens sont retirés automatiquement à la limite.'
          : 'Oldest entries are trimmed automatically at the limit.'}
      </Text>
      {rows.map(({ label, value, max, icon: Icon }) => {
        const ratio = Math.min(1, value / max);
        const color = ratio >= 0.9 ? palette.error : ratio >= 0.7 ? palette.warning : palette.accent;
        return (
          <View key={label} style={styles.row}>
            <View style={styles.rowLabel}>
              <Icon size={15} color={color} />
              <Text style={styles.label}>{label}</Text>
              <Text style={[styles.value, { color }]}>{value} / {max}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (p: Palette) => ({
  card: { backgroundColor: p.bgElevated, borderWidth: 1, borderColor: p.border, borderRadius: 12, padding: 14, marginBottom: 12 },
  eyebrow: { color: p.accent, fontFamily: FONT.monoBold, fontSize: 9, letterSpacing: 1.4 },
  title: { color: p.text, fontFamily: FONT.display, fontSize: 16, marginTop: 3 },
  description: { color: p.textDim, fontFamily: FONT.ui, fontSize: 13, lineHeight: 18, marginTop: 5, marginBottom: 8 },
  row: { marginTop: 10 },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { flex: 1, color: p.text, fontFamily: FONT.uiMedium, fontSize: 13 },
  value: { fontFamily: FONT.monoBold, fontSize: 10 },
  track: { height: 5, overflow: 'hidden', borderRadius: 3, backgroundColor: p.bgDeep, marginTop: 6 },
  fill: { height: 5, borderRadius: 3 },
} as const);
