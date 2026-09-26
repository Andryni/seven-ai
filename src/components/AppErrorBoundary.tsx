import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { FONT } from '../theme/typography';
import type { Palette } from '../theme/theme';

interface Props {
  children: React.ReactNode;
  palette: Palette;
  language: 'fr' | 'en';
}

interface State {
  error: Error | null;
}

/** Last-resort UI for render/lifecycle crashes. It intentionally displays no
 * stack or user data; technical details remain in the local console only. */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[SEVEN fatal UI error]', error, info.componentStack);
  }

  private recover = async () => {
    this.setState({ error: null });
    if (Platform.OS !== 'web' && Updates.isEnabled) {
      await Updates.reloadAsync().catch(() => {});
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const fr = this.props.language === 'fr';
    return (
      <View style={[styles.screen, { backgroundColor: this.props.palette.bg }]}>
        <Text style={[styles.code, { color: this.props.palette.error }]}>SEVEN // SAFE MODE</Text>
        <Text style={[styles.title, { color: this.props.palette.text }]}>
          {fr ? 'Une erreur d’interface est survenue' : 'The interface encountered an error'}
        </Text>
        <Text style={[styles.body, { color: this.props.palette.textDim }]}>
          {fr
            ? 'Vos données n’ont pas été affichées dans ce rapport. Réessayez ou redémarrez l’application.'
            : 'Your data was not included in this report. Retry or restart the app.'}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={fr ? 'Réessayer' : 'Retry'}
          style={[styles.button, { backgroundColor: this.props.palette.accent }]}
          onPress={this.recover}
        >
          <Text style={[styles.buttonText, { color: this.props.palette.bgDeep }]}>
            {fr ? 'RÉESSAYER' : 'RETRY'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  code: { fontFamily: FONT.mono, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontFamily: FONT.uiMedium, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  body: { fontFamily: FONT.ui, fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 10, maxWidth: 460 },
  button: { minWidth: 150, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontFamily: FONT.mono, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
});
