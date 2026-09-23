import React from 'react';
import { FONT } from '../theme/typography';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { DaveProject } from '../types';
import { useSevenStore } from '../store/useSevenStore';
import { soundFx } from '../services/soundFxService';
import {
  Layers,
  X,
  Code2,
  FolderCode,
  Gamepad2,
  LayoutDashboard,
  Cpu,
} from 'lucide-react-native';

interface ProjectManagerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectTemplate: (templateName: string, prompt: string) => void;
}

const TEMPLATES = [
  {
    id: 'portfolio',
    name: 'Cyber Developer Portfolio',
    desc: 'Hero with typewriter effect, skills radar, filterable project gallery, and encrypted contact form.',
    prompt: 'make a good developer portfolio website with interactive projects, skills meter, and dark cyberpunk glow',
    icon: Code2,
    color: '#00E5FF',
  },
  {
    id: 'saas',
    name: 'Neural Agent SaaS Platform',
    desc: 'High-conversion SaaS landing page with animated pricing tiers, feature breakdown, and live waitlist.',
    prompt: 'build a modern AI Agent SaaS landing page with dark mode, interactive pricing cards, and feature matrix',
    icon: LayoutDashboard,
    color: '#FFD700',
  },
  {
    id: 'dashboard',
    name: 'Robotics HUD Operations Center',
    desc: 'Sci-fi real-time operations dashboard with interactive gauges, telemetry logs, and status matrix.',
    prompt: 'create a high-tech robotics telemetry dashboard with dark HUD metrics, live gauges, and alert feed',
    icon: Cpu,
    color: '#00FFA3',
  },
  {
    id: 'game',
    name: 'Retro Cyber Arcade Mini-Game',
    desc: 'Canvas-based arcade asteroid dodging mini-game with score tracking and neon laser effects.',
    prompt: 'build a retro arcade mini-game in pure HTML canvas with neon laser mechanics and high score tracker',
    icon: Gamepad2,
    color: '#FF3366',
  },
];

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  visible,
  onClose,
  onSelectTemplate,
}) => {
  const daveProjects = useSevenStore((s) => s.daveProjects);
  const setActiveDaveProject = useSevenStore((s) => s.setActiveDaveProject);

  const handlePickTemplate = (t: typeof TEMPLATES[0]) => {
    soundFx.playActivationChime();
    onSelectTemplate(t.name, t.prompt);
    onClose();
  };

  const handlePickProject = (p: DaveProject) => {
    soundFx.playTelemetryPing();
    setActiveDaveProject(p);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <Layers size={16} color="#00E5FF" />
              <View>
                <Text style={styles.modalTitle}>DAVE AGENT // TEMPLATE &amp; PROJECT HUB</Text>
                <Text style={styles.modalSubtitle}>ARCHITECTURAL BLUEPRINTS</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} accessibilityLabel="Close" onPress={onClose}>
              <X size={16} color="#FFD700" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Template Library */}
            <Text style={styles.sectionTitle}>PRE-CALIBRATED ARCHITECTURAL TEMPLATES</Text>
            <View style={styles.templateList}>
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.templateCard, { borderColor: t.color + '44' }]}
                    accessibilityLabel={t.name}
                    onPress={() => handlePickTemplate(t)}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: t.color + '18' }]}>
                      <Icon size={18} color={t.color} />
                    </View>
                    <View style={styles.templateInfo}>
                      <Text style={[styles.templateName, { color: t.color }]}>{t.name}</Text>
                      <Text style={styles.templateDesc}>{t.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Saved Projects in SevenUploads */}
            <Text style={styles.sectionTitle}>SYNTHESIZED PROJECTS IN SEVEN_UPLOADS</Text>
            {daveProjects.length === 0 ? (
              <Text style={styles.emptyText}>No previous projects found in storage.</Text>
            ) : (
              daveProjects.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.projectCard}
                  accessibilityLabel={p.name}
                  onPress={() => handlePickProject(p)}
                >
                  <FolderCode size={16} color="#FFD700" />
                  <View style={styles.projectInfo}>
                    <Text style={styles.projectName}>{p.name.toUpperCase()}</Text>
                    <Text style={styles.projectPrompt}>Prompt: "{p.prompt}"</Text>
                    <Text style={styles.projectMeta}>
                      Generated: {new Date(p.timestamp).toLocaleTimeString()} • 3 Files (HTML, CSS, JS)
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.closeModalBtn} accessibilityLabel="Dismiss" onPress={onClose}>
              <Text style={styles.closeModalText}>DISMISS</Text>
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
    padding: 14,
  },
  modalContent: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '85%',
    backgroundColor: '#0a0a10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00E5FF',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 229, 255, 0.25)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontFamily: FONT.mono,
    color: '#00E5FF',
    fontSize: 11,
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
  sectionTitle: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 6,
  },
  templateList: {
    gap: 8,
    marginBottom: 16,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 6,
    borderWidth: 1,
    padding: 10,
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontFamily: FONT.mono,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  templateDesc: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 9,
    lineHeight: 13,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    padding: 10,
    gap: 10,
    marginBottom: 8,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  projectPrompt: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 215, 0, 0.8)',
    fontSize: 9,
    marginTop: 2,
  },
  projectMeta: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 8,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 9.5,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  modalFooter: {
    padding: 10,
    backgroundColor: 'rgba(5, 5, 8, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'flex-end',
  },
  closeModalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
  },
  closeModalText: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 9.5,
  },
});
