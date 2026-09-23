import React, { useState } from 'react';
import { FONT } from '../theme/typography';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSevenStore } from '../store/useSevenStore';
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
              <ShieldAlert size={18} color="#FF3366" />
              <View>
                <Text style={styles.modalTitle}>ANTI-PANIC ENGINE // CLR SYNTHESIZER</Text>
                <Text style={styles.modalSubtitle}>AST HOT-PATCH RECOVERY MATRIX</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} accessibilityLabel="Close" onPress={onClose}>
              <X size={16} color="#FFD700" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Status overview card */}
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <View style={styles.statusIndicator}>
                  <View style={styles.pulsingLight} />
                  <Text style={styles.statusLabel}>AST INTEGRITY MONITOR</Text>
                </View>
                <Text style={styles.statusActiveText}>ARMED & ACTIVE</Text>
              </View>

              <Text style={styles.statusDesc}>
                Wraps runtime calls, catches regressions, prompts Gemini AST synthesizer to generate
                atomic hot-patches, verifies bytecode, and hot-swaps live without crashing.
              </Text>

              <TouchableOpacity
                style={[styles.simulateBtn, isHealing && styles.simulatingBtn]}
                accessibilityLabel="Trigger bug simulation and auto-fix"
                onPress={handleSimulate}
                disabled={isHealing}
              >
                <Zap size={14} color="#050508" />
                <Text style={styles.simulateBtnText}>
                  {isHealing ? 'SYNTHESIZING HOT-PATCH...' : 'TRIGGER BUG SIMULATION & AUTO-FIX'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Patch History / Last Patch Details */}
            <Text style={styles.sectionHeader}>LATEST PATCH JOURNAL</Text>

            {patchLogs.length === 0 ? (
              <Text style={styles.noPatchText}>No patches applied yet. All AST trees nominal.</Text>
            ) : (
              patchLogs.map((p) => (
                <View key={p.id} style={styles.patchCard}>
                  <View style={styles.patchHeader}>
                    <View style={styles.patchIdBadge}>
                      <Cpu size={12} color="#00FFA3" />
                      <Text style={styles.patchIdText}>PATCH #{p.id}</Text>
                    </View>
                    <View style={styles.verifiedPill}>
                      <CheckCircle2 size={10} color="#00FFA3" />
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

                    <Text style={styles.diffLabelFixed}>+ SYNTHESIZED FIX:</Text>
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    backgroundColor: '#0a0a10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF3366',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'rgba(255, 51, 102, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 51, 102, 0.3)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontFamily: FONT.mono,
    color: '#FF3366',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 8.5,
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 12,
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: '#00FFA3',
  },
  statusLabel: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  statusActiveText: {
    fontFamily: FONT.mono,
    color: '#00FFA3',
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusDesc: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 9.5,
    lineHeight: 14,
    marginBottom: 10,
  },
  simulateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    paddingVertical: 8,
    borderRadius: 4,
    gap: 6,
  },
  simulatingBtn: {
    backgroundColor: '#BD00FF',
  },
  simulateBtnText: {
    fontFamily: FONT.mono,
    color: '#050508',
    fontSize: 10,
    fontWeight: '800',
  },
  sectionHeader: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  noPatchText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontStyle: 'italic',
  },
  patchCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
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
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '800',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 255, 163, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  verifiedText: {
    fontFamily: FONT.mono,
    color: '#00FFA3',
    fontSize: 8.5,
    fontWeight: '700',
  },
  targetFileText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 9.5,
    marginBottom: 6,
  },
  errorBox: {
    backgroundColor: 'rgba(255, 51, 102, 0.08)',
    borderLeftWidth: 2,
    borderLeftColor: '#FF3366',
    padding: 6,
    marginBottom: 6,
  },
  errorLabel: {
    fontFamily: FONT.mono,
    color: '#FF3366',
    fontSize: 8.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  errorContent: {
    fontFamily: FONT.mono,
    color: '#FF80A0',
    fontSize: 9,
  },
  diffBox: {
    backgroundColor: '#050508',
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  diffLabelOriginal: {
    fontFamily: FONT.mono,
    color: '#FF3366',
    fontSize: 8.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  codeSnippetOriginal: {
    fontFamily: FONT.mono,
    color: '#FFA0B0',
    fontSize: 9.5,
    marginBottom: 6,
  },
  diffLabelFixed: {
    fontFamily: FONT.mono,
    color: '#00FFA3',
    fontSize: 8.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  codeSnippetFixed: {
    fontFamily: FONT.mono,
    color: '#A7F3D0',
    fontSize: 9.5,
  },
  engineText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 8.5,
  },
  modalFooter: {
    padding: 10,
    backgroundColor: 'rgba(5, 5, 8, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 215, 0, 0.2)',
    alignItems: 'flex-end',
  },
  dismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 4,
  },
  dismissBtnText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '700',
  },
});
