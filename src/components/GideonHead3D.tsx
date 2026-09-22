import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { AssistantStatus } from '../types';
import { buildGideonHeadScene } from '../core/gideonHeadScene';
import { VISEME_SHAPES, VisemeId, textToVisemes } from '../core/visemes';

interface GideonHead3DProps {
  status?: AssistantStatus;
  size?: number;
  amplitude?: number;
  themeColor?: string;
  speechText?: string;
  speechRate?: number;
  /** Called when WebGL is unavailable so the caller can fall back to 2D. */
  onUnavailable?: () => void;
}

/** WebGL-side palette per status (RGB 0..1), mirroring the 2D face hues. */
const SCENE_HUES: Record<string, { color: number[]; deep: number[]; core: number[] }> = {
  idle: { color: [0.0, 0.9, 1.0], deep: [0.02, 0.16, 0.21], core: [0.85, 0.98, 1.0] },
  listening: { color: [0.0, 1.0, 0.64], deep: [0.01, 0.17, 0.11], core: [0.8, 1.0, 0.9] },
  organizing: { color: [0.0, 1.0, 0.64], deep: [0.01, 0.17, 0.11], core: [0.8, 1.0, 0.9] },
  speaking: { color: [0.13, 0.83, 0.93], deep: [0.02, 0.15, 0.19], core: [0.85, 0.98, 1.0] },
  thinking: { color: [0.74, 0.0, 1.0], deep: [0.1, 0.01, 0.19], core: [0.94, 0.83, 1.0] },
  building: { color: [0.0, 0.7, 1.0], deep: [0.01, 0.11, 0.19], core: [0.84, 0.94, 1.0] },
  healing: { color: [1.0, 0.2, 0.4], deep: [0.19, 0.01, 0.06], core: [1.0, 0.83, 0.88] },
};

interface SceneFrame {
  open: number;
  width: number;
  full: number;
  durationMs: number;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export const GideonHead3D: React.FC<GideonHead3DProps> = ({
  status = 'idle',
  size = 270,
  amplitude = 0,
  themeColor,
  speechText = '',
  speechRate = 1,
  onUnavailable,
}) => {
  const html = useMemo(() => buildGideonHeadScene(), []);
  const [ready, setReady] = useState(false);
  const webRef = useRef<WebView>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const wasSpeaking = useRef(false);
  const lastAmpSent = useRef(-1);
  const lastAmpAt = useRef(0);

  const hue = useMemo(() => {
    if (status === 'idle' && themeColor) {
      // Keep the user's accent for the idle state, like the 2D avatar does.
      return SCENE_HUES.idle;
    }
    return SCENE_HUES[status] || SCENE_HUES.idle;
  }, [status, themeColor]);

  // --------------------------------------------------------------- transport
  const send = useCallback((payload: unknown) => {
    const message = JSON.stringify(payload);
    if (Platform.OS === 'web') {
      try {
        frameRef.current?.contentWindow?.postMessage(message, '*');
      } catch {
        // iframe not mounted yet
      }
      return;
    }
    try {
      webRef.current?.postMessage(message);
    } catch {
      // WebView still booting
    }
  }, []);

  const handleMessage = useCallback(
    (raw: string) => {
      let data: any = raw;
      if (typeof raw === 'string') {
        try {
          data = JSON.parse(raw);
        } catch {
          return;
        }
      }
      if (!data || !data.type) return;
      if (data.type === 'ready') {
        setReady(true);
      } else if (data.type === 'error') {
        console.warn('Gideon 3D scene error:', data.message);
        onUnavailable?.();
      }
    },
    [onUnavailable]
  );

  // On web the iframe has no onMessage prop: listen on window and filter by
  // the frame's own contentWindow so other postMessage traffic is ignored.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (event: MessageEvent) => {
      if (frameRef.current && event.source !== frameRef.current.contentWindow) return;
      handleMessage(typeof event.data === 'string' ? event.data : JSON.stringify(event.data));
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handleMessage]);

  // ------------------------------------------------------- status + amplitude
  useEffect(() => {
    if (!ready) return;
    send({
      type: 'config',
      status,
      color: hue.color,
      deep: hue.deep,
      core: hue.core,
      amplitude: round(Math.max(0, Math.min(amplitude, 1))),
    });
    lastAmpSent.current = amplitude;
  }, [ready, status, hue, amplitude, send]);

  // Amplitude arrives ~8 times per second: only forward meaningful changes so
  // the bridge never becomes the bottleneck.
  useEffect(() => {
    if (!ready || status !== 'listening') return;
    const now = Date.now();
    const delta = Math.abs(amplitude - lastAmpSent.current);
    if (delta < 0.06 && now - lastAmpAt.current < 240) return;
    lastAmpAt.current = now;
    lastAmpSent.current = amplitude;
    send({ type: 'config', status, amplitude: round(Math.max(0, Math.min(amplitude, 1))) });
  }, [ready, status, amplitude, send]);

  // -------------------------------------------------------------- lip-sync
  useEffect(() => {
    if (!ready) return;
    const speaking = status === 'speaking';

    if (!speaking) {
      if (wasSpeaking.current) {
        wasSpeaking.current = false;
        send({ type: 'stop' });
      }
      return;
    }

    wasSpeaking.current = true;

    // Resolve the viseme timeline here and ship plain numbers: the WebGL page
    // then plays it locally with no per-frame bridge traffic.
    const frames: SceneFrame[] = textToVisemes(speechText, { rate: speechRate }).map((frame) => {
      const shape = VISEME_SHAPES[frame.viseme as VisemeId] || VISEME_SHAPES.rest;
      return {
        open: round(shape.open),
        width: round(shape.width),
        full: round(shape.full),
        durationMs: frame.durationMs,
      };
    });

    send({ type: 'speak', frames });
  }, [ready, status, speechText, speechRate, send]);

  // ------------------------------------------------------------------ render
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.root, { width: size, height: size }]}>
        <iframe
          ref={frameRef as any}
          title="Gideon 3D head"
          srcDoc={html}
          sandbox="allow-scripts"
          onLoad={() => setReady(true)}
          style={{ ...styles.frame, border: 'none' } as any}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.frame}
        scrollEnabled={false}
        pointerEvents="none"
        onMessage={(event) => handleMessage(event.nativeEvent.data)}
        javaScriptEnabled
        domStorageEnabled={false}
        androidLayerType="hardware"
        overScrollMode="never"
        setBuiltInZoomControls={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  frame: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});
