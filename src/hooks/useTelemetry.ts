import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface TelemetryData {
  cpuLoad: number;
  ramUsage: string;
  fps: number;
  latency: number;
  threads: number;
  batteryLevel: number;
  isCharging: boolean;
  batterySimulated: boolean;
  networkType: string;
  networkConnected: boolean;
  networkSimulated: boolean;
}

/**
 * Telemetry hook: battery (expo-battery) and network (NetInfo) are REAL.
 * CPU/RAM/threads/latency are simulated (no public RN API) and the FPS is
 * measured via requestAnimationFrame deltas.
 * `batterySimulated` / `networkSimulated` let the UI tag the values honestly.
 */
export const useTelemetry = () => {
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    cpuLoad: 14,
    ramUsage: '3.8 GB',
    fps: 60,
    latency: 16,
    threads: 18,
    batteryLevel: 100,
    isCharging: false,
    batterySimulated: true,
    networkType: 'unknown',
    networkConnected: true,
    networkSimulated: true,
  });

  // Track whether native battery/network data arrived.
  const batteryRealRef = useRef(false);
  const networkRealRef = useRef(false);

  // ---- REAL battery (expo-battery) -------------------------------------
  useEffect(() => {
    if (Platform.OS === 'web') return; // expo-battery unavailable on web
    let mounted = true;

    Battery.getBatteryLevelAsync()
      .then((level) => {
        if (!mounted) return;
        batteryRealRef.current = true;
        setTelemetry((prev) => ({
          ...prev,
          batteryLevel: Math.max(0, Math.min(100, Math.round(level * 100))),
          isCharging: false,
          batterySimulated: false,
        }));
      })
      .catch(() => {
        // stays simulated
      });

    const subState = Battery.addBatteryStateListener((state) => {
      if (!mounted) return;
      batteryRealRef.current = true;
      setTelemetry((prev) => ({
        ...prev,
        isCharging:
          state.batteryState === Battery.BatteryState.CHARGING ||
          state.batteryState === Battery.BatteryState.FULL,
        batterySimulated: false,
      }));
    });
    const subLevel = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (!mounted) return;
      setTelemetry((prev) => ({
        ...prev,
        batteryLevel: Math.max(0, Math.min(100, Math.round(batteryLevel * 100))),
        batterySimulated: false,
      }));
    });

    return () => {
      mounted = false;
      if (subState?.remove) subState.remove();
      if (subLevel?.remove) subLevel.remove();
    };
  }, []);

  // ---- REAL network (NetInfo) -------------------------------------------
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      networkRealRef.current = true;
      setTelemetry((prev) => ({
        ...prev,
        networkType: state.type ?? 'unknown',
        networkConnected: !!state.isConnected,
        networkSimulated: false,
      }));
    });
    NetInfo.fetch()
      .then((state) => {
        setTelemetry((prev) => ({
          ...prev,
          networkType: state.type ?? 'unknown',
          networkConnected: !!state.isConnected,
          networkSimulated: false,
        }));
      })
      .catch(() => {});

    return () => unsubscribe();
  }, []);

  // ---- REAL FPS (requestAnimationFrame deltas) --------------------------
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return;
    let raf = 0;
    let frames = 0;
    let last = Date.now();
    const loop = () => {
      frames++;
      const now = Date.now();
      if (now - last >= 1000) {
        const fps = Math.round((frames * 1000) / (now - last));
        setTelemetry((prev) => ({ ...prev, fps: Math.max(1, Math.min(120, fps)) }));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- SIMULATED metrics (no public RN API): jittered, clearly flagged ----
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        cpuLoad: Math.floor(Math.random() * 18 + 10),
        ramUsage: `${(3.2 + Math.random() * 1.4).toFixed(1)} GB`,
        latency: Math.floor(Math.random() * 8 + 12),
        threads: Math.floor(Math.random() * 4 + 16),
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return telemetry;
};
