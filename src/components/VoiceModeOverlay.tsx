import React, { useEffect, useMemo, useRef } from 'react';
import { FONT } from '../theme/typography';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { X, Loader, Waves } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { playChime } from '../services/chime';
import { OrbView } from './OrbView';
import { VoiceCore } from './VoiceCore';
import { AudioVisualizer } from './AudioVisualizer';
import { AssistantStatus } from '../types';
import { useTheme, useThemeStyles } from '../theme/theme';
import type { Palette } from '../theme/theme';
import { t } from '../theme/i18n';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VoiceModeOverlayProps {
  status: AssistantStatus;
  amplitude: number;
  themeColor: string;
  avatarStyle?: 'gideon' | 'vector' | 'shader';
  gyroEnabled?: boolean;
  /** Text currently being spoken — drives Gideon's lip-sync visemes. */
  speechText?: string;
  /** TTS rate used to time the visemes. */
  speechRate?: number;
  speechPositionMs?: number;
  speechDurationMs?: number;
  /** Transient expression: smiles after a successful action, stiffens on failure. */
  mood?: 'happy' | 'alert' | null;
  isRecording: boolean;
  /** A speaking turn is open (synthesis may still be in flight). */
  isSpeaking: boolean;
  /** Sound is coming out of the speaker right now — drives the motion. */
  isAudible: boolean;
  /** Latest thing the user said. */
  userText: string;
  /** Latest SEVEN answer. */
  sevenText: string;
  /** Human-readable label of the tool/action currently running, if any. */
  actionLabel?: string | null;
  voiceMode: 'real' | 'demo';
  language?: 'fr' | 'en';
  onMicPress: () => void;
  onStopSpeaking: () => void;
  onClose: () => void;
}

/**
 * One-shot hologram scan: a thin light band sweeps down the overlay while the
 * boot sequence materializes, then never runs again until the next opening.
 */
const BootSweep: React.FC<{ sweep: Animated.Value; color: string }> = ({ sweep, color }) => {
  const y = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, SCREEN_HEIGHT * 0.92],
  });
  const opacity = sweep.interpolate({
    inputRange: [0, 0.12, 0.85, 1],
    outputRange: [0, 0.55, 0.55, 0],
  });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 2.5,
          borderRadius: 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateY: y }],
        }}
      />
    </View>
  );
};

/**
 * Concentric rings that deploy behind the avatar during the boot — the middle
 * one keeps rotating as a dashed reticle, the outer one counter-rotates with
 * arc gaps, so the stage never looks frozen while idle.
 */
const BootRings: React.FC<{
  size: number;
  color: string;
  styles: ReturnType<typeof voiceStyles>;
}> = ({ size, color, styles }) => {
  const deploy = useMemo(() => [0, 1, 2].map(() => new Animated.Value(0)), []);
  const reticle = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    Animated.parallel(
      deploy.map((v, i) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 640,
          delay: 110 + i * 95,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();
    const spin = Animated.loop(
      Animated.timing(reticle, {
        toValue: 1,
        duration: 16000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, [deploy, reticle]);

  const ringAnim = (v: Animated.Value) => ({
    opacity: Animated.multiply(v, 0.6),
    transform: [
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) } as const,
    ],
  });
  const cw = reticle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ccw = reticle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  const box = size + 140;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.ringStage,
        { width: box, height: box, marginLeft: -box / 2, marginTop: -box / 2 },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, ringAnim(deploy[0])]}
      >
        <Svg width="100%" height="100%">
          <Circle cx="50%" cy="50%" r={size / 2 + 12} stroke={color} strokeWidth={1} fill="none" opacity={0.5} />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          ringAnim(deploy[1]),
          { transform: [{ scale: deploy[1].interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }, { rotate: cw }] },
        ]}
      >
        <Svg width="100%" height="100%">
          <Circle cx="50%" cy="50%" r={size / 2 + 42} stroke={color} strokeWidth={1} fill="none" strokeDasharray="6 11" opacity={0.45} />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          ringAnim(deploy[2]),
          { transform: [{ scale: deploy[2].interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }, { rotate: ccw }] },
        ]}
      >
        <Svg width="100%" height="100%">
          <Circle cx="50%" cy="50%" r={size / 2 + 68} stroke={color} strokeWidth={1.5} fill="none" strokeDasharray="74 52" opacity={0.32} />
        </Svg>
      </Animated.View>
    </View>
  );
};

/** Four HUD brackets that snap in around the stage as the boot settles. */
const HudCorners: React.FC<{
  color: string;
  styles: ReturnType<typeof voiceStyles>;
}> = ({ color, styles }) => {
  const anims = useMemo(() => [0, 1, 2, 3].map(() => new Animated.Value(0)), []);

  useEffect(() => {
    Animated.parallel(
      anims.map((v, i) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 300,
          delay: 360 + i * 70,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();
  }, [anims]);

  const corners = [styles.hudCornerTL, styles.hudCornerTR, styles.hudCornerBL, styles.hudCornerBR];
  return (
    <>
      {anims.map((v, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            corners[i],
            {
              borderColor: color,
              opacity: Animated.multiply(v, 0.55),
              transform: [
                { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              ],
            },
          ]}
        />
      ))}
    </>
  );
};

/**
 * Single animated transcript line. Animates in only when it transitions from
 * empty to non-empty, so token-by-token streaming does not re-trigger the
 * reveal on every character (which would look jittery).
 */
const AnimatedLine: React.FC<{
  label: string;
  text: string;
  color: string;
  align: 'left' | 'right';
  styles: ReturnType<typeof voiceStyles>;
}> = ({ label, text, color, align, styles }) => {
  const anim = useMemo(() => new Animated.Value(0), []);
  const wasEmpty = useRef(true);

  useEffect(() => {
    const empty = !text || text.trim().length === 0;
    if (!empty && wasEmpty.current) {
      wasEmpty.current = false;
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    if (empty) wasEmpty.current = true;
  }, [text, anim]);

  if (!text || text.trim().length === 0) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  return (
    <Animated.View
      style={[
        styles.lineWrap,
        align === 'right' ? styles.lineRight : styles.lineLeft,
        { opacity: anim, transform: [{ translateY }] },
      ]}
    >
      <Text style={[styles.lineLabel, { color }]}>{label}</Text>
      <Text style={[styles.lineText, align === 'right' ? styles.lineTextRight : null]}>
        {text.trim()}
      </Text>
    </Animated.View>
  );
};

/**
 * Animated card shown while SEVEN is executing a tool/action: rotating gear,
 * the action label, and an indeterminate scan bar.
 */
const ActionActivityCard: React.FC<{
  label: string;
  color: string;
  styles: ReturnType<typeof voiceStyles>;
  title: string;
}> = ({ label, color, styles, title }) => {
  const spin = useMemo(() => new Animated.Value(0), []);
  const scan = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scan, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    spinLoop.start();
    scanLoop.start();
    return () => {
      spinLoop.stop();
      scanLoop.stop();
    };
  }, [spin, scan]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scanX = scan.interpolate({ inputRange: [0, 1], outputRange: [-160, 160] });

  return (
    <Animated.View style={[styles.actionCard, { borderColor: color }]}>
      <View style={styles.actionHeader}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Loader size={14} color={color} />
        </Animated.View>
        <Text style={[styles.actionKicker, { color }]}>{title}</Text>
      </View>
      <Text style={styles.actionLabel} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.scanTrack}>
        <Animated.View
          style={[
            styles.scanBar,
            { backgroundColor: color, transform: [{ translateX: scanX }] },
          ]}
        />
      </View>
    </Animated.View>
  );
};

/**
 * Immersive full-screen voice mode. Replaces the whole chat surface with only
 * the avatar, what the user said, what SEVEN answers, and a live, animated
 * read-out of the action SEVEN is currently performing.
 */
export const VoiceModeOverlay: React.FC<VoiceModeOverlayProps> = ({
  status,
  amplitude,
  themeColor,
  avatarStyle = 'gideon',
  gyroEnabled = true,
  speechText = '',
  speechRate = 1,
  speechPositionMs,
  speechDurationMs,
  mood = null,
  isRecording,
  isSpeaking,
  isAudible,
  userText,
  sevenText,
  actionLabel,
  voiceMode,
  language = 'en',
  onMicPress,
  onStopSpeaking,
  onClose,
}) => {
  const palette = useTheme();
  const styles = useThemeStyles(voiceStyles);

  const enter = useMemo(() => new Animated.Value(0), []);
  const exit = useMemo(() => new Animated.Value(1), []);
  const orbScale = useMemo(() => new Animated.Value(0.6), []);
  const contentRise = useMemo(() => new Animated.Value(0), []);
  const sweep = useMemo(() => new Animated.Value(0), []);
  const closing = useRef(false);
  const wasRecording = useRef(false);

  // Boot choreography: chime → surface → rings/corners deploy → orb springs →
  // one hologram sweep. Each layer lands slightly after the previous one so
  // the opening reads as a machine powering up, not a fade.
  useEffect(() => {
    void playChime('boot');
    Animated.parallel([
      Animated.timing(enter, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(orbScale, {
        toValue: 1,
        friction: 7,
        tension: 55,
        useNativeDriver: true,
        delay: 320,
      }),
      Animated.timing(contentRise, {
        toValue: 1,
        duration: 520,
        delay: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sweep, {
        toValue: 1,
        duration: 850,
        delay: 460,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [enter, orbScale, contentRise, sweep]);

  // Short blip each time the mic arms — audible confirmation of the listen.
  useEffect(() => {
    if (isRecording && !wasRecording.current) void playChime('wake');
    wasRecording.current = isRecording;
  }, [isRecording]);

  const handleClose = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(exit, {
      toValue: 0,
      duration: 240,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const overlayOpacity = Animated.multiply(enter, exit);

  const statusLabel = (() => {
    switch (status) {
      case 'listening':
        return t('voice.listening', language);
      case 'thinking':
        return t('voice.processing', language);
      case 'speaking':
        return t('voice.speaking', language);
      case 'organizing':
      case 'building':
      case 'healing':
        return t('voice.executing', language);
      default:
        return t('voice.tapToSpeak', language);
    }
  })();

  const orbSize = Math.min(SCREEN_WIDTH * 0.72, 296);
  // Only real sound animates the instrument: while the neural voice is still
  // being synthesized the stage stays still, which is what makes the moment
  // the voice starts land.
  const active = isRecording || isAudible || status === 'thinking';

  return (
    <Animated.View style={[styles.root, { opacity: overlayOpacity }]}>
      {/* Depth tint so the overlay reads as its own surface */}
      <View style={styles.bgTint} pointerEvents="none" />

      {/* Boot choreography: materializing scan + HUD brackets */}
      <BootSweep sweep={sweep} color={themeColor} />
      <HudCorners color={themeColor} styles={styles} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeBtn} accessibilityLabel="Close" onPress={handleClose} hitSlop={10}>
          <X size={18} color={palette.textDim} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Waves size={14} color={palette.accent} />
          <Text style={styles.title}>{t('voice.title', language)}</Text>
        </View>
        <View style={styles.closeBtn} />
      </View>

      {/* Avatar stage — the boot rings deploy behind the orb */}
      <View style={styles.stage}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <BootRings size={orbSize} color={themeColor} styles={styles} />
          <Animated.View style={{ transform: [{ scale: orbScale }] }}>
            <OrbView
              size={orbSize}
              status={status}
              amplitude={amplitude}
              themeColor={themeColor}
              mode={avatarStyle}
              gyroEnabled={gyroEnabled}
              speechText={speechText}
              speechRate={speechRate}
              speechPositionMs={speechPositionMs}
              speechDurationMs={speechDurationMs}
              mood={mood}
            />
          </Animated.View>
        </View>

        <View style={styles.waveRow}>
          <AudioVisualizer isActive={active} barCount={26} color={themeColor} maxHeight={30} />
        </View>

        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isRecording
                  ? palette.error
                  : isSpeaking
                  ? palette.success
                  : palette.accent,
              },
            ]}
          />
          <Text style={styles.statusText}>
            {voiceMode === 'demo' ? '[DEMO MIC] ' : ''}
            {statusLabel}
          </Text>
        </View>
      </View>

      {/* Transcript: what I said + what it answered (+ live action) */}
      <View style={styles.transcript}>
        <AnimatedLine
          label={t('voice.you', language)}
          text={userText}
          color={palette.accent}
          align="right"
          styles={styles}
        />

        {actionLabel ? (
          <ActionActivityCard
            label={actionLabel}
            color={palette.warning}
            styles={styles}
            title={t('voice.action', language)}
          />
        ) : null}

        <AnimatedLine
          label={t('voice.seven', language)}
          text={sevenText}
          color={palette.warning}
          align="left"
          styles={styles}
        />
      </View>

      {/* Bottom controls: the instrument-like voice core */}
      <Animated.View
        style={[
          styles.bottomBar,
          {
            opacity: contentRise,
            transform: [
              { translateY: contentRise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            ],
          },
        ]}
      >
        <VoiceCore
          state={
            isAudible
              ? 'speaking'
              : isRecording
              ? 'listening'
              : status === 'thinking' || status === 'building' || status === 'organizing'
              ? 'busy'
              : 'idle'
          }
          amplitude={amplitude}
          accentColor={themeColor}
          talkLabel={t('voice.tapToSpeak', language)}
          stopLabel={t('common.stop', language)}
          onPress={onMicPress}
          onStop={onStopSpeaking}
          size={178}
        />
        <Text style={styles.micHint}>
          {isAudible
            ? t('common.stop', language)
            : isRecording
            ? t('voice.listening', language)
            : isSpeaking
            ? t('voice.processing', language)
            : t('voice.tapToSpeak', language)}
        </Text>
      </Animated.View>
    </Animated.View>
  );
};

const voiceStyles = (t: Palette) =>
  ({
    root: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 500,
    },
    ringStage: {
      position: 'absolute',
      top: '50%',
      left: '50%',
    },
    hudCornerTL: {
      position: 'absolute',
      top: 92,
      left: 24,
      width: 22,
      height: 22,
      borderTopWidth: 1.5,
      borderLeftWidth: 1.5,
    },
    hudCornerTR: {
      position: 'absolute',
      top: 92,
      right: 24,
      width: 22,
      height: 22,
      borderTopWidth: 1.5,
      borderRightWidth: 1.5,
    },
    hudCornerBL: {
      position: 'absolute',
      bottom: Math.round(SCREEN_HEIGHT * 0.31),
      left: 24,
      width: 22,
      height: 22,
      borderBottomWidth: 1.5,
      borderLeftWidth: 1.5,
    },
    hudCornerBR: {
      position: 'absolute',
      bottom: Math.round(SCREEN_HEIGHT * 0.31),
      right: 24,
      width: 22,
      height: 22,
      borderBottomWidth: 1.5,
      borderRightWidth: 1.5,
    },
    bgTint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      // Effectively opaque: immersive mode must show ONLY Gideon, the
      // transcript and the controls — no chat bleed-through.
      backgroundColor: 'rgba(3, 5, 8, 0.99)',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
    },
    closeBtn: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      backgroundColor: t.accentSoft,
    },
    titleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    title: {
      fontFamily: FONT.display,
      color: t.accent,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 3,
    },
    stage: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    waveRow: {
      marginTop: 2,
      alignItems: 'center',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
      paddingHorizontal: 12,
      paddingVertical: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.2,
    },
    transcript: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
      gap: 10,
    },
    lineWrap: {
      maxWidth: '92%',
    },
    lineLeft: {
      alignSelf: 'flex-start',
    },
    lineRight: {
      alignSelf: 'flex-end',
      alignItems: 'flex-end',
    },
    lineLabel: {
      fontFamily: FONT.uiMedium,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 2,
      marginBottom: 3,
    },
    lineText: {
      // The transcript is the only thing to read in voice mode: it gets the
      // readable face and room to breathe.
      fontFamily: FONT.ui,
      color: t.text,
      fontSize: 15,
      fontWeight: '400',
      lineHeight: 22,
      letterSpacing: 0.2,
    },
    lineTextRight: {
      textAlign: 'right',
    },
    actionCard: {
      alignSelf: 'center',
      width: '94%',
      backgroundColor: 'rgba(0, 0, 0, 0.66)',
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    actionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginBottom: 5,
    },
    actionKicker: {
      fontFamily: FONT.uiMedium,
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    actionLabel: {
      fontFamily: FONT.ui,
      color: t.text,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 8,
    },
    scanTrack: {
      height: 3,
      borderRadius: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      overflow: 'hidden',
    },
    scanBar: {
      width: 70,
      height: 3,
      borderRadius: 2,
    },
    bottomBar: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 40,
      paddingTop: 12,
      gap: 10,
    },

    micHint: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.5,
    },
  } as const);
