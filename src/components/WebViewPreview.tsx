import React, { useState } from 'react';
import { FONT } from '../theme/typography';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { storageService } from '../services/storageService';
import { DaveProject } from '../types';
import {
  Smartphone,
  Tablet,
  Monitor,
  Code2,
  Eye,
  ExternalLink,
  RefreshCw,
  Bug,
} from 'lucide-react-native';

interface WebViewPreviewProps {
  project: DaveProject;
  onTriggerBug?: () => void;
  onClose?: () => void;
}

export const WebViewPreview: React.FC<WebViewPreviewProps> = ({
  project,
  onTriggerBug,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'html' | 'css' | 'js'>('preview');
  const [deviceMode, setDeviceMode] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [key, setKey] = useState(0);

  // Combine files into standalone HTML string with inline CSS & JS for 100% reliable preview
  const standaloneHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    ${project.files['style.css'] || ''}
  </style>
</head>
<body>
  ${project.files['index.html'] || '<h1>No HTML</h1>'}
  <script>
    try {
      ${project.files['script.js'] || ''}
    } catch(err) {
      console.error("Preview script error:", err);
    }
  </script>
</body>
</html>
`;

  const handleOpenBrowser = async () => {
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([standaloneHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        // Write a single self-contained HTML file and open the native share
        // sheet with its file URI. The previous implementation shared the raw
        // HTML as a text message, which never opened a browser.
        const docDir = storageService.getDocumentDirectory();
        const exportDir = `${docDir}SevenUploads/export/`;
        await storageService.ensureDirectory(exportDir);
        const fileName = `${project.name}.html`;
        const filePath = `${exportDir}${fileName}`;
        await storageService.writeAsString(filePath, standaloneHtml);

        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(filePath, {
            mimeType: 'text/html',
            dialogTitle: 'Open or share Dave project',
            UTI: 'public.html',
          });
        }
      }
    } catch (e) {
      console.warn('Failed to open in external browser:', e);
    }
  };

  const getDeviceWidth = () => {
    switch (deviceMode) {
      case 'mobile':
        return 340;
      case 'tablet':
        return 500;
      case 'desktop':
      default:
        return '100%';
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Controls Bar */}
      <View style={styles.topBar}>
        <View style={styles.tabGroup}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'preview' && styles.activeTabBtn]}
            accessibilityLabel="Preview tab"
            onPress={() => setActiveTab('preview')}
          >
            <Eye size={12} color={activeTab === 'preview' ? '#050508' : '#FFD700'} />
            <Text style={[styles.tabText, activeTab === 'preview' && styles.activeTabText]}>
              PREVIEW
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'html' && styles.activeTabBtn]}
            accessibilityLabel="HTML tab"
            onPress={() => setActiveTab('html')}
          >
            <Code2 size={12} color={activeTab === 'html' ? '#050508' : '#00E5FF'} />
            <Text style={[styles.tabText, activeTab === 'html' && styles.activeTabText]}>
              HTML
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'css' && styles.activeTabBtn]}
            accessibilityLabel="CSS tab"
            onPress={() => setActiveTab('css')}
          >
            <Code2 size={12} color={activeTab === 'css' ? '#050508' : '#00FFA3'} />
            <Text style={[styles.tabText, activeTab === 'css' && styles.activeTabText]}>
              CSS
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'js' && styles.activeTabBtn]}
            accessibilityLabel="JS tab"
            onPress={() => setActiveTab('js')}
          >
            <Code2 size={12} color={activeTab === 'js' ? '#050508' : '#FFA500'} />
            <Text style={[styles.tabText, activeTab === 'js' && styles.activeTabText]}>
              JS
            </Text>
          </TouchableOpacity>
        </View>

        {/* Device preview toggles */}
        {activeTab === 'preview' && (
          <View style={styles.deviceToggles}>
            <TouchableOpacity
              style={[styles.deviceBtn, deviceMode === 'mobile' && styles.activeDeviceBtn]}
              accessibilityLabel="Mobile preview"
              onPress={() => setDeviceMode('mobile')}
            >
              <Smartphone size={13} color={deviceMode === 'mobile' ? '#FFD700' : 'rgba(255,255,255,0.4)'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deviceBtn, deviceMode === 'tablet' && styles.activeDeviceBtn]}
              accessibilityLabel="Tablet preview"
              onPress={() => setDeviceMode('tablet')}
            >
              <Tablet size={13} color={deviceMode === 'tablet' ? '#FFD700' : 'rgba(255,255,255,0.4)'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deviceBtn, deviceMode === 'desktop' && styles.activeDeviceBtn]}
              accessibilityLabel="Desktop preview"
              onPress={() => setDeviceMode('desktop')}
            >
              <Monitor size={13} color={deviceMode === 'desktop' ? '#FFD700' : 'rgba(255,255,255,0.4)'} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Main View Area */}
      <View style={styles.contentArea}>
        {activeTab === 'preview' ? (
          <View style={styles.previewWrapper}>
            <View
              style={[
                styles.deviceFrame,
                {
                  width: getDeviceWidth(),
                  maxWidth: '100%',
                },
              ]}
            >
              {Platform.OS === 'web' ? (
                // Web iframe preview
                <iframe
                  key={key}
                  title="Dave Project Preview"
                  srcDoc={standaloneHtml}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    backgroundColor: '#0a0a10',
                  }}
                  sandbox="allow-scripts allow-modals allow-forms"
                />
              ) : (
                // Native WebView
                <WebView
                  key={key}
                  originWhitelist={['*']}
                  source={{ html: standaloneHtml }}
                  style={styles.webView}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                />
              )}
            </View>
          </View>
        ) : (
          // Code Inspector
          <ScrollView style={styles.codeScrollView} contentContainerStyle={styles.codeScrollContent}>
            <Text style={styles.codeText}>
              {activeTab === 'html' && project.files['index.html']}
              {activeTab === 'css' && project.files['style.css']}
              {activeTab === 'js' && project.files['script.js']}
            </Text>
          </ScrollView>
        )}
      </View>

      {/* Bottom Action Footer */}
      <View style={styles.footerBar}>
        <View style={styles.footerLeft}>
          <TouchableOpacity style={styles.footerBtn} accessibilityLabel="Reload" onPress={() => setKey((k) => k + 1)}>
            <RefreshCw size={12} color="#FFD700" />
            <Text style={styles.footerBtnText}>Reload</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.footerBtn} accessibilityLabel="Open in browser" onPress={handleOpenBrowser}>
            <ExternalLink size={12} color="#00E5FF" />
            <Text style={styles.footerBtnText}>Open Browser</Text>
          </TouchableOpacity>
        </View>

        {onTriggerBug && (
          <TouchableOpacity style={styles.healTriggerBtn} accessibilityLabel="Simulate self-heal" onPress={onTriggerBug}>
            <Bug size={12} color="#FFF" />
            <Text style={styles.healTriggerText}>Simulate Self-Heal</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0a10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    overflow: 'hidden',
    height: 440,
    marginVertical: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(5, 5, 8, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 215, 0, 0.2)',
  },
  tabGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    gap: 4,
  },
  activeTabBtn: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  tabText: {
    fontFamily: FONT.mono,
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFD700',
  },
  activeTabText: {
    color: '#050508',
  },
  deviceToggles: {
    flexDirection: 'row',
    gap: 6,
  },
  deviceBtn: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeDeviceBtn: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  contentArea: {
    flex: 1,
    backgroundColor: '#050508',
  },
  previewWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#08080d',
  },
  deviceFrame: {
    flex: 1,
    height: '100%',
    backgroundColor: '#000',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0a0a10',
  },
  codeScrollView: {
    flex: 1,
    padding: 12,
    backgroundColor: '#06060a',
  },
  codeScrollContent: {
    paddingBottom: 20,
  },
  codeText: {
    fontFamily: FONT.mono,
    color: '#A7F3D0',
    fontSize: 11,
    lineHeight: 16,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(5, 5, 8, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 215, 0, 0.2)',
  },
  footerLeft: {
    flexDirection: 'row',
    gap: 8,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 4,
  },
  footerBtnText: {
    fontFamily: FONT.mono,
    fontSize: 9.5,
    color: '#FFD700',
    fontWeight: '700',
  },
  healTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF3366',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  healTriggerText: {
    fontFamily: FONT.mono,
    fontSize: 9.5,
    color: '#FFF',
    fontWeight: '800',
  },
});
