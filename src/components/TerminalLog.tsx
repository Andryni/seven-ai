import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSevenStore } from '../store/useSevenStore';
import { TerminalLogEntry } from '../types';
import { Terminal, Trash2 } from 'lucide-react-native';
import { FONT } from '../theme/typography';

interface TerminalLogProps {
  maxHeight?: number;
  showControls?: boolean;
  title?: string;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({
  maxHeight = 220,
  showControls = true,
  title = 'SEVEN_OS // KERNEL LOG',
}) => {
  const logs = useSevenStore((s) => s.terminalLogs);
  const clearTerminalLogs = useSevenStore((s) => s.clearTerminalLogs);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [logs]);

  const getLineColor = (type: TerminalLogEntry['type']) => {
    switch (type) {
      case 'cmd':
        return '#00E5FF';
      case 'success':
        return '#00FFA3';
      case 'warn':
        return '#FFA500';
      case 'error':
        return '#FF3366';
      case 'patch':
        return '#BD00FF';
      case 'info':
      default:
        return '#FFD700';
    }
  };

  const getLinePrefix = (type: TerminalLogEntry['type']) => {
    switch (type) {
      case 'cmd':
        return '$ ';
      case 'success':
        return '✔ ';
      case 'warn':
        return '▲ ';
      case 'error':
        return '✖ ';
      case 'patch':
        return '✦ ';
      case 'info':
      default:
        return '> ';
    }
  };

  return (
    <View style={[styles.container, { maxHeight }]}>
      {/* Terminal Title Bar */}
      <View style={styles.titleBar}>
        <View style={styles.titleLeft}>
          <Terminal size={13} color="#FFD700" />
          <Text style={styles.titleText}>{title}</Text>
          <View style={styles.liveIndicator} />
        </View>

        {showControls && (
          <View style={styles.controls}>
            <TouchableOpacity
              onPress={clearTerminalLogs}
              style={styles.controlButton}
              accessibilityLabel="Clear log"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Trash2 size={11} color="rgba(255, 215, 0, 0.7)" />
              <Text style={styles.controlText}>CLR</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Log scroll area */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>[NO ACTIVE TASKS // STANDBY]</Text>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={styles.logRow}>
              <Text style={styles.timeTag}>[{log.timestamp}]</Text>
              <Text style={[styles.prefix, { color: getLineColor(log.type) }]}>
                {getLinePrefix(log.type)}
              </Text>
              <Text style={[styles.logText, { color: getLineColor(log.type) }]}>
                {log.text}
              </Text>
            </View>
          ))
        )}
        <View style={styles.cursorRow}>
          <Text style={styles.cursorText}>_</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(5, 5, 10, 0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    overflow: 'hidden',
    marginVertical: 6,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 215, 0, 0.2)',
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  liveIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#00FFA3',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 3,
  },
  controlText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 9,
  },
  scrollArea: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scrollContent: {
    paddingBottom: 6,
  },
  emptyText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 215, 0, 0.4)',
    fontSize: 10,
    fontStyle: 'italic',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  timeTag: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    marginRight: 5,
  },
  prefix: {
    fontFamily: FONT.mono,
    fontSize: 10,
    fontWeight: '700',
    marginRight: 2,
  },
  logText: {
    fontFamily: FONT.mono,
    fontSize: 10.5,
    lineHeight: 14,
    flex: 1,
    fontWeight: '500',
  },
  cursorRow: {
    marginTop: 2,
  },
  cursorText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700',
  },
});
