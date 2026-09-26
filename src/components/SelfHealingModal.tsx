import React, { useState } from 'react';
import { FONT } from '../theme/typography';
import { useTheme, useThemeStyles, type Palette } from '../theme/theme';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSevenStore } from '../store/useSevenStore';
import { t } from '../theme/i18n';
import {
  ShieldAlert,
  Zap,
  X,
  Cpu,
  CheckCircle2,
} from 'lucide-react-native';

interface SelfHealingModalProps {
  visible: boolean;
  onClose: () => void;
  onSimulateBug?: () => Promise<void>;
}

export const SelfHealingModal: React.FC<SelfHealingModalProps> = ({
  visible,
  onClose,
  onSimulateBug,
}) => {
  const patchLogs = useSevenStore((s) => s.patchLogs);
  const palette = useTheme();
  const styles = useThemeStyles(diagnosticStyles);
  const lang = useSevenStore((s) => s.config.language ?? 'en');
  const [isHealing, setIsHealing] = useState(false);

  const handleSimulate = async () => {
    if (!onSimulateBug) return;
    setIsHealing(true);
    try {
      await onSimulateBug();
    } finally {
      setIsHealing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <ShieldAlert size={18} color={palette.error} />
              <View>
                <Text style={styles.modalTitle}>{t('diagnostics.title', lang)}</Text>
                <Text style={styles.modalSubtitle}>{t('diagnostics.subtitle', lang)}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} accessibilityLabel="Close" onPress={onClose}>
              <X size={16} color={palette.accent} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Status overview card */}
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <View style={styles.statusIndicator}>
                  <View style={styles.pulsingLight} />
                  <Text style={styles.statusLabel}>{t('diagnostics.monitor', lang)}</Text>
                </View>
                <Text style={styles.statusActiveText}>{t('diagnostics.monitoring', lang)}</Text>
              </View>

              <Text style={styles.statusDesc}>
                {t('diagnostics.description', lang)}
              </Text>

              <TouchableOpacity
                style={[styles.simulateBtn, isHealing && styles.simulatingBtn]}
                accessibilityLabel="Trigger diagnostic simulation"
                onPress={handleSimulate}
                disabled={isHealing}
              >
                <Zap size={14} color={palette.bgDeep} />
                <Text style={styles.simulateBtnText}>
                  {isHealing ? t('diagnostics.running', lang) : t('diagnostics.run', lang)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Patch History / Last Patch Details */}
            <Text style={styles.sectionHeader}>{t('diagnostics.latest', lang)}</Text>

            {patchLogs.length === 0 ? (
              <Text style={styles.noPatchText}>{t('diagnostics.empty', lang)}</Text>
            ) : (
              patchLogs.map((p) => (
                <View key={p.id} style={styles.patchCard}>
                  <View style={styles.patchHeader}>
                    <View style={styles.patchIdBadge}>
                      <Cpu size={12} color={palette.success} />
                      <Text style={styles.patchIdText}>REPORT #{p.id}</Text>
                    </View>
                    <View style={styles.verifiedPill}>
                      <CheckCircle2 size={10} color={palette.success} />
                      <Text style={styles.verifiedText}>{p.status.toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={styles.targetFileText}>Target: {p.targetFile}</Text>

                  <View style={styles.errorBox}>
                    <Text style={styles.errorLabel}>CAUGHT ERROR:</Text>
                    <Text style={styles.errorContent}>{p.error}</Text>
                  </View>

                  <View style={styles.diffBox}>
                    <Text style={styles.diffLabelOriginal}>- ORIGINAL (BUGGY):</Text>
                    <Text style={styles.codeSnippetOriginal}>{p.originalSnippet}</Text>

                    <Text style={styles.diffLabelFixed}>+ {t('diagnostics.suggested', lang)}:</Text>
                    <Text style={styles.codeSnippetFixed}>{p.fixedSnippet}</Text>
                  </View>

                  <Text style={styles.engineText}>Engine: {p.engine}</Text>
                </View>
              ))
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.dismissBtn} accessibilityLabel="Dismiss" onPress={onClose}>
              <Text style={styles.dismissBtnText}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const diagnosticStyles = (palette: Palette) => ({
  backdrop: {
    flex: 1,
    backgroundColor: palette.isDark ? 'rgba(0,0,0,0.85)' : 'rgba(20,20,30,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    backgroundColor: palette.bgDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.error,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: palette.accentSoft,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderStrong,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontFamily: FONT.mono,
    color: palette.error,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontFamily: FONT.mono,
    color: palette.textFaint,
    fontSize: 8.5,
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 12,
  },
  statusCard: {
    backgroundColor: palette.bgDeep,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulsingLight: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: palette.success,
  },
  statusLabel: {
    fontFamily: FONT.mono,
    color: palette.text,
    fontSize: 10,
    fontWeight: '700',
  },
  statusActiveText: {
    fontFamily: FONT.mono,
    color: palette.success,
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusDesc: {
    fontFamily: FONT.mono,
    color: palette.textDim,
    fontSize: 9.5,
    lineHeight: 14,
    marginBottom: 10,
  },
  simulateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
    paddingVertical: 8,
    borderRadius: 4,
    gap: 6,
  },
  simulatingBtn: {
    backgroundColor: palette.info,
  },
  simulateBtnText: {
    fontFamily: FONT.mono,
    color: palette.bgDeep,
    fontSize: 10,
    fontWeight: '800',
  },
  sectionHeader: {
    fontFamily: FONT.mono,
    color: palette.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  noPatchText: {
    fontFamily: FONT.mono,
    color: palette.textFaint,
    fontSize: 10,
    fontStyle: 'italic',
  },
  patchCard: {
    backgroundColor: palette.bgDeep,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 10,
    marginBottom: 10,
  },
  patchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  patchIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  patchIdText: {
    fontFamily: FONT.mono,
    color: palette.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  verifiedText: {
    fontFamily: FONT.mono,
    color: palette.success,
    fontSize: 8.5,
    fontWeight: '700',
  },
  targetFileText: {
    fontFamily: FONT.mono,
    color: palette.textDim,
    fontSize: 9.5,
    marginBottom: 6,
  },
  errorBox: {
    backgroundColor: palette.accentSoft,
    borderLeftWidth: 2,
    borderLeftColor: palette.error,
    padding: 6,
    marginBottom: 6,
  },
  errorLabel: {
    fontFamily: FONT.mono,
    color: palette.error,
    fontSize: 8.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  errorContent: {
    fontFamily: FONT.mono,
    color: palette.error,
    fontSize: 9,
  },
  diffBox: {
    backgroundColor: palette.bgDeep,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  diffLabelOriginal: {
    fontFamily: FONT.mono,
    color: palette.error,
    fontSize: 8.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  codeSnippetOriginal: {
    fontFamily: FONT.mono,
    color: palette.error,
    fontSize: 9.5,
    marginBottom: 6,
  },
  diffLabelFixed: {
    fontFamily: FONT.mono,
    color: palette.success,
    fontSize: 8.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  codeSnippetFixed: {
    fontFamily: FONT.mono,
    color: palette.success,
    fontSize: 9.5,
  },
  engineText: {
    fontFamily: FONT.mono,
    color: palette.textFaint,
    fontSize: 8.5,
  },
  modalFooter: {
    padding: 10,
    backgroundColor: palette.bgElevated,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    alignItems: 'flex-end',
  },
  dismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: palette.accentSoft,
    borderRadius: 4,
  },
  dismissBtnText: {
    fontFamily: FONT.mono,
    color: palette.accent,
    fontSize: 10,
    fontWeight: '700',
  },
} as const);
