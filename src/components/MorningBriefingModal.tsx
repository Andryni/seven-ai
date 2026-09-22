import React, { useState, useEffect } from 'react';
import { FONT } from '../theme/typography';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { morningBriefingService, MorningBriefingData } from '../services/morningBriefingService';
import { useVoice } from '../hooks/useVoice';
import { soundFx } from '../services/soundFxService';
import { AudioVisualizer } from './AudioVisualizer';
import {
  Sun,
  Mail,
  Calendar,
  Cpu,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  ShieldCheck,
  BatteryCharging,
  Globe,
} from 'lucide-react-native';

interface MorningBriefingModalProps {
  visible: boolean;
  onClose: () => void;
}

export const MorningBriefingModal: React.FC<MorningBriefingModalProps> = ({
  visible,
  onClose,
}) => {
  const [briefing, setBriefing] = useState<MorningBriefingData | null>(null);
  const { speak, stopSpeaking, isSpeaking } = useVoice();

  useEffect(() => {
    if (visible) {
      soundFx.playActivationChime();
      morningBriefingService.generateBriefing().then(setBriefing);
    } else if (isSpeaking) {
      stopSpeaking();
    }
    // Deliberately reactive to `visible` only: speak state changes should not
    // re-trigger briefing generation or the dismissal chime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSpeakBriefing = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else if (briefing) {
      soundFx.playTelemetryPing();
      speak(briefing.spokenScript);
    }
  };

  if (!briefing) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <Sparkles size={16} color="#FFD700" />
              <View>
                <Text style={styles.modalTitle}>EXECUTIVE DAILY BRIEFING</Text>
                <Text style={styles.modalSubtitle}>JARVIS // FRIDAY NEURAL HUD</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={16} color="#FFD700" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Greeting */}
            <View style={styles.greetingBox}>
              <Text style={styles.greetingText}>{briefing.greeting}</Text>
              <Text style={styles.subGreetingText}>All orbital subsystems synchronized.</Text>
            </View>

            {/* Weather Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Sun size={15} color="#FFA500" />
                <Text style={styles.cardTitle}>ENVIRONMENTAL TELEMETRY</Text>
              </View>
              <View style={styles.weatherRow}>
                <Text style={styles.tempText}>{briefing.weather.temp}</Text>
                <View>
                  <Text style={styles.weatherCond}>{briefing.weather.condition}</Text>
                  <Text style={styles.weatherMeta}>
                    Humidity: {briefing.weather.humidity} • Location: {briefing.weather.location}
                  </Text>
                </View>
              </View>
            </View>

            {/* Agenda & Calendar */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Calendar size={15} color="#00E5FF" />
                <Text style={styles.cardTitle}>TODAY'S OPERATIONAL AGENDA</Text>
              </View>
              {briefing.agendaItems.map((item, idx) => (
                <View key={idx} style={styles.agendaRow}>
                  <Text style={styles.agendaTime}>[{item.time}]</Text>
                  <Text style={styles.agendaText}>{item.title}</Text>
                </View>
              ))}
            </View>

            {/* Transmissions / Gmail */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Mail size={15} color="#00FFA3" />
                <Text style={styles.cardTitle}>INCOMING TRANSMISSIONS</Text>
              </View>
              <Text style={styles.bodyText}>{briefing.unreadEmailsSummary}</Text>
            </View>

            {/* Real headlines (RSS) — hidden entirely when the feeds are down. */}
            {briefing.headlines.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Globe size={15} color="#00E5FF" />
                  <Text style={styles.cardTitle}>GLOBAL NEWS FEED</Text>
                </View>
                {briefing.headlines.map((item, idx) => (
                  <View key={idx} style={styles.agendaRow}>
                    <Text style={styles.agendaTime}>[{item.source}]</Text>
                    <Text style={styles.agendaText} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Device & AST Integrity */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Cpu size={15} color="#FFD700" />
                <Text style={styles.cardTitle}>SYSTEM MATRIX &amp; AST INTEGRITY</Text>
              </View>
              <View style={styles.healthRow}>
                <View style={styles.healthPill}>
                  <BatteryCharging size={12} color="#00FFA3" />
                  <Text style={styles.healthLabel}>{briefing.deviceHealth.battery}</Text>
                </View>
                <View style={styles.healthPill}>
                  <ShieldCheck size={12} color="#00E5FF" />
                  <Text style={styles.healthLabel}>{briefing.deviceHealth.astStatus}</Text>
                </View>
              </View>
            </View>

            {/* Audio Visualizer during speech */}
            <View style={styles.visualizerContainer}>
              <AudioVisualizer isActive={isSpeaking} color="#FFD700" barCount={24} />
            </View>
          </ScrollView>

          {/* Footer Bar */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.voiceBtn, isSpeaking && styles.voiceBtnActive]}
              onPress={handleSpeakBriefing}
            >
              {isSpeaking ? (
                <>
                  <VolumeX size={15} color="#050508" />
                  <Text style={styles.voiceBtnText}>STOP NARRATION</Text>
                </>
              ) : (
                <>
                  <Volume2 size={15} color="#050508" />
                  <Text style={styles.voiceBtnText}>READ BRIEFING ALOUD</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
              <Text style={styles.dismissText}>DISMISS</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: '#0a0a10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 215, 0, 0.25)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
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
  greetingBox: {
    padding: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFD700',
    marginBottom: 10,
  },
  greetingText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '800',
  },
  subGreetingText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 9.5,
    marginTop: 2,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cardTitle: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tempText: {
    fontFamily: FONT.mono,
    color: '#FFA500',
    fontSize: 22,
    fontWeight: '900',
  },
  weatherCond: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  weatherMeta: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 8.5,
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  agendaTime: {
    fontFamily: FONT.mono,
    color: '#00E5FF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  agendaText: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 10,
    flex: 1,
  },
  bodyText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 10,
    lineHeight: 14,
  },
  healthRow: {
    flexDirection: 'row',
    gap: 8,
  },
  healthPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  healthLabel: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 9,
  },
  visualizerContainer: {
    marginVertical: 6,
    alignItems: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(5, 5, 8, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 215, 0, 0.2)',
  },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    gap: 6,
  },
  voiceBtnActive: {
    backgroundColor: '#FF3366',
  },
  voiceBtnText: {
    fontFamily: FONT.mono,
    color: '#050508',
    fontSize: 10,
    fontWeight: '900',
  },
  dismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 4,
  },
  dismissText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
  },
});
