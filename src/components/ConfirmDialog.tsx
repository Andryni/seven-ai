import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme, useThemeStyles } from '../theme/theme';
import type { Palette } from '../theme/theme';
import { FONT } from '../theme/typography';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive tint (red) for the confirm action. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Cross-platform confirmation dialog styled like the HUD.
 * Used instead of React Native's Alert.alert(), which is a silent no-op
 * on react-native-web (nothing renders and the user gets no feedback).
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  const palette = useTheme();
  const styles = useThemeStyles(confirmStyles);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={[styles.iconWrap, destructive && styles.iconWrapDestructive]}>
              <AlertTriangle size={16} color={destructive ? palette.error : palette.warning} />
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              accessibilityLabel={cancelLabel}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, destructive && styles.confirmBtnDestructive]}
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const confirmStyles = (t: Palette) =>
  ({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: t.bgElevated,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.borderStrong,
      padding: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: 5,
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapDestructive: {
      backgroundColor: 'rgba(255, 51, 102, 0.12)',
      borderColor: t.error,
    },
    title: {
      flex: 1,
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    message: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 10.5,
      lineHeight: 15,
      marginTop: 8,
      marginLeft: 36,
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 14,
    },
    cancelBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: t.borderStrong,
      backgroundColor: t.accentSoft,
    },
    cancelText: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    confirmBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 4,
      backgroundColor: t.accent,
    },
    confirmBtnDestructive: {
      backgroundColor: t.error,
    },
    confirmText: {
      fontFamily: FONT.mono,
      color: t.bgDeep,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
  } as const);
