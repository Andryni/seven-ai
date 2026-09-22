import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

export interface DocumentAnalysisResult {
  success: boolean;
  name: string;
  size?: number;
  mimeType?: string;
  textSnippet?: string;
  fullLength?: number;
  message: string;
}

/**
 * Service to pick and parse local documents (PDF, TXT, JSON, MD, CSV, Code files)
 * and prepare text snippets for Seven AI analysis.
 */
class DocumentAnalysisService {
  /**
   * Prompt user to pick a document and read its textual content
   */
  public async pickAndReadDocument(): Promise<DocumentAnalysisResult> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return {
          success: false,
          name: '',
          message: 'Document selection cancelled.',
        };
      }

      const file = result.assets[0];
      const uri = file.uri;
      const name = file.name;
      const mimeType = file.mimeType || 'text/plain';
      const size = file.size;

      // Attempt to read as text if text/code/json/csv/markdown
      let textContent = '';
      try {
        textContent = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } catch {
        textContent = `[Binary file: ${name} (${size} bytes, type ${mimeType})]`;
      }

      const snippet = textContent.slice(0, 3500);

      return {
        success: true,
        name,
        size,
        mimeType,
        textSnippet: snippet,
        fullLength: textContent.length,
        message: `Successfully loaded document "${name}" (${size ? Math.round(size / 1024) : 0} KB).`,
      };
    } catch (e: any) {
      return {
        success: false,
        name: '',
        message: `Failed to load document: ${e.message || e}`,
      };
    }
  }
}

export const documentAnalysisService = new DocumentAnalysisService();
