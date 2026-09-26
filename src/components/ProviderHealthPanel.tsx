import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Activity, CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react-native';
import { providerHealthService, type ProviderHealth, type ProviderId } from '../services/providerHealthService';
import { useTheme, useThemeStyles, type Palette } from '../theme/theme';
import { FONT } from '../theme/typography';

interface Props {
  language: 'en' | 'fr';
  providers: { id: ProviderId; label: string; key: string }[];
}

export function ProviderHealthPanel({ language, providers }: Props) {
  const palette = useTheme();
  const styles = useThemeStyles(createStyles);
  const [results, setResults] = useState<Partial<Record<ProviderId, ProviderHealth>>>({});
  const [checking, setChecking] = useState<ProviderId | null>(null);

  const check = async (id: ProviderId, key: string) => {
    setChecking(id);
    const result = await providerHealthService.verify(id, key);
    setResults((current) => ({ ...current, [id]: result }));
    setChecking(null);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Activity size={17} color={palette.accent} />
        <View>
          <Text style={styles.title}>{language === 'fr' ? 'SANTÉ DES FOURNISSEURS' : 'PROVIDER HEALTH'}</Text>
          <Text style={styles.subtitle}>
            {language === 'fr' ? 'Vérification explicite, jamais automatique' : 'Explicit checks, never automatic'}
          </Text>
        </View>
      </View>
      {providers.map((provider) => {
        const result = results[provider.id];
        const active = checking === provider.id;
        const statusColor = !provider.key ? palette.textFaint : result?.ok ? palette.success : result ? palette.error : palette.warning;
        return (
          <View key={provider.id} style={styles.row}>
            {result?.ok ? (
              <CheckCircle2 size={16} color={statusColor} />
            ) : (
              <CircleAlert size={16} color={statusColor} />
            )}
            <View style={styles.copy}>
              <Text style={styles.provider}>{provider.label}</Text>
              <Text style={[styles.status, { color: statusColor }]} numberOfLines={1}>
                {!provider.key
                  ? language === 'fr' ? 'NON CONFIGURÉ' : 'NOT CONFIGURED'
                  : result
                    ? `${result.message} · ${result.latencyMs} ms`
                    : language === 'fr' ? 'PRÊT À TESTER' : 'READY TO TEST'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.testButton, (!provider.key || active) && styles.disabled]}
              disabled={!provider.key || active}
              accessibilityLabel={`${language === 'fr' ? 'Tester' : 'Test'} ${provider.label}`}
              onPress={() => check(provider.id, provider.key)}
            >
              <RefreshCw size={13} color={palette.accent} />
              <Text style={styles.testText}>{active ? '…' : language === 'fr' ? 'TESTER' : 'TEST'}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (p: Palette) => ({
  card: {
    backgroundColor: p.bgElevated,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 7 },
  title: { color: p.text, fontFamily: FONT.uiMedium, fontSize: 14 },
  subtitle: { color: p.textFaint, fontFamily: FONT.ui, fontSize: 11 },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: p.border,
  },
  copy: { flex: 1, minWidth: 0 },
  provider: { color: p.text, fontFamily: FONT.uiMedium, fontSize: 13 },
  status: { fontFamily: FONT.mono, fontSize: 9, marginTop: 2 },
  testButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: p.accentSoft,
    borderWidth: 1,
    borderColor: p.borderStrong,
  },
  disabled: { opacity: 0.4 },
  testText: { color: p.accent, fontFamily: FONT.monoBold, fontSize: 9 },
} as const);
