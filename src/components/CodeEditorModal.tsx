import React, { useState } from 'react';
import { FONT } from '../theme/typography';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { DaveProject } from '../types';
import { soundFx } from '../services/soundFxService';
import {
  Code2,
  Save,
  X,
  FileCode,
  CheckCircle2,
} from 'lucide-react-native';

interface CodeEditorModalProps {
  visible: boolean;
  project: DaveProject;
  onClose: () => void;
  onSave: (updatedFiles: { 'index.html': string; 'style.css': string; 'script.js': string }) => void;
}

export const CodeEditorModal: React.FC<CodeEditorModalProps> = ({
  visible,
  project,
  onClose,
  onSave,
}) => {
  const [activeFile, setActiveFile] = useState<'index.html' | 'style.css' | 'script.js'>('index.html');
  const [htmlCode, setHtmlCode] = useState(project.files['index.html'] || '');
  const [cssCode, setCssCode] = useState(project.files['style.css'] || '');
  const [jsCode, setJsCode] = useState(project.files['script.js'] || '');
  const [savedBadge, setSavedBadge] = useState(false);

  // Reset the editors when the underlying project changes. Adjusting state
  // during render (official React pattern) instead of a sync-setState effect,
  // which the React Compiler flags as cascading renders.
  const [prevProject, setPrevProject] = useState(project);
  if (prevProject !== project) {
    setPrevProject(project);
    setHtmlCode(project.files['index.html'] || '');
    setCssCode(project.files['style.css'] || '');
    setJsCode(project.files['script.js'] || '');
  }

  const handleSave = () => {
    soundFx.playPatchSuccess();
    onSave({
      'index.html': htmlCode,
      'style.css': cssCode,
      'script.js': jsCode,
    });
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 2000);
  };

  const getActiveCode = () => {
    switch (activeFile) {
      case 'index.html':
        return htmlCode;
      case 'style.css':
        return cssCode;
      case 'script.js':
        return jsCode;
    }
  };

  const handleCodeChange = (text: string) => {
    switch (activeFile) {
      case 'index.html':
        setHtmlCode(text);
        break;
      case 'style.css':
        setCssCode(text);
        break;
      case 'script.js':
        setJsCode(text);
        break;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <Code2 size={16} color="#00E5FF" />
              <View>
                <Text style={styles.modalTitle}>DAVE AGENT // LIVE CODE EDITOR</Text>
                <Text style={styles.modalSubtitle}>PROJECT: {project.name.toUpperCase()}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} accessibilityLabel="Close" onPress={onClose}>
              <X size={16} color="#FFD700" />
            </TouchableOpacity>
          </View>

          {/* File selector tabs */}
          <View style={styles.fileTabBar}>
            <TouchableOpacity
              style={[styles.fileTab, activeFile === 'index.html' && styles.fileTabActiveHtml]}
              accessibilityLabel="index.html"
              onPress={() => setActiveFile('index.html')}
            >
              <FileCode size={12} color={activeFile === 'index.html' ? '#050508' : '#00E5FF'} />
              <Text
                style={[
                  styles.fileTabText,
                  activeFile === 'index.html' && styles.fileTabTextActive,
                ]}
              >
                index.html
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.fileTab, activeFile === 'style.css' && styles.fileTabActiveCss]}
              accessibilityLabel="style.css"
              onPress={() => setActiveFile('style.css')}
            >
              <FileCode size={12} color={activeFile === 'style.css' ? '#050508' : '#00FFA3'} />
              <Text
                style={[
                  styles.fileTabText,
                  activeFile === 'style.css' && styles.fileTabTextActive,
                ]}
              >
                style.css
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.fileTab, activeFile === 'script.js' && styles.fileTabActiveJs]}
              accessibilityLabel="script.js"
              onPress={() => setActiveFile('script.js')}
            >
              <FileCode size={12} color={activeFile === 'script.js' ? '#050508' : '#FFA500'} />
              <Text
                style={[
                  styles.fileTabText,
                  activeFile === 'script.js' && styles.fileTabTextActive,
                ]}
              >
                script.js
              </Text>
            </TouchableOpacity>
          </View>

          {/* Code Editor TextInput */}
          <View style={styles.editorArea}>
            <TextInput
              style={styles.codeTextInput}
              value={getActiveCode()}
              onChangeText={handleCodeChange}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="// Write your code here..."
              placeholderTextColor="rgba(255,255,255,0.25)"
            />
          </View>

          {/* Footer Bar */}
          <View style={styles.modalFooter}>
            <View style={styles.footerInfo}>
              {savedBadge && (
                <View style={styles.savedPill}>
                  <CheckCircle2 size={11} color="#00FFA3" />
                  <Text style={styles.savedPillText}>HOT-RELOAD APPLIED</Text>
                </View>
              )}
            </View>

            <View style={styles.footerButtons}>
              <TouchableOpacity style={styles.saveBtn} accessibilityLabel="Save and hot-reload" onPress={handleSave}>
                <Save size={14} color="#050508" />
                <Text style={styles.saveBtnText}>SAVE &amp; HOT-RELOAD</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeModalBtn} accessibilityLabel="Close" onPress={onClose}>
                <Text style={styles.closeModalText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
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
    maxWidth: 620,
    height: '85%',
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
    padding: 10,
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
  fileTabBar: {
    flexDirection: 'row',
    backgroundColor: '#050508',
    paddingHorizontal: 8,
    paddingTop: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  fileTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fileTabActiveHtml: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
  },
  fileTabActiveCss: {
    backgroundColor: '#00FFA3',
    borderColor: '#00FFA3',
  },
  fileTabActiveJs: {
    backgroundColor: '#FFA500',
    borderColor: '#FFA500',
  },
  fileTabText: {
    fontFamily: FONT.mono,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '700',
  },
  fileTabTextActive: {
    color: '#050508',
    fontWeight: '800',
  },
  editorArea: {
    flex: 1,
    backgroundColor: '#040406',
    padding: 8,
  },
  codeTextInput: {
    flex: 1,
    color: '#A7F3D0',
    fontFamily: FONT.mono,
    fontSize: 11.5,
    lineHeight: 16,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(5, 5, 8, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerInfo: {
    flex: 1,
  },
  savedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 255, 163, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    alignSelf: 'flex-start',
  },
  savedPillText: {
    fontFamily: FONT.mono,
    color: '#00FFA3',
    fontSize: 8.5,
    fontWeight: '700',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00E5FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 4,
    gap: 5,
  },
  saveBtnText: {
    fontFamily: FONT.mono,
    color: '#050508',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  closeModalBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 4,
  },
  closeModalText: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 10,
  },
});
