import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';

export interface DocumentAnalysisResult {
  success: boolean;
  name: string;
  size?: number;
  mimeType?: string;
  textSnippet?: string;
  /** Binary attachment for Gemini multimodal document analysis (currently PDF). */
  base64?: string;
  fullLength?: number;
  message: string;
}

/**
 * Picks text/code documents, extracts DOCX XML locally, and preserves PDF
 * bytes for Gemini's native page-aware document understanding. Unsupported
 * binary formats are rejected instead of being misread as UTF-8.
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
      const extension = name.split('.').pop()?.toLowerCase() || '';
      const textExtensions = new Set([
        'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'js', 'jsx', 'ts', 'tsx',
        'py', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'css', 'html', 'xml', 'yaml', 'yml', 'sql', 'log',
      ]);
      const isText = mimeType.startsWith('text/') || textExtensions.has(extension);
      const isPdf = mimeType === 'application/pdf' || extension === 'pdf';
      const isDocx =
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        extension === 'docx';

      if (!isText && !isPdf && !isDocx) {
        return {
          success: false,
          name,
          size,
          mimeType,
          message: `“${name}” is not a supported text, PDF, or DOCX document.`,
        };
      }

      const limit = isPdf ? 10 * 1024 * 1024 : 2 * 1024 * 1024;
      if (size && size > limit) {
        return {
          success: false,
          name,
          size,
          mimeType,
          message: `“${name}” is larger than the ${Math.round(limit / 1024 / 1024)} MB document limit.`,
        };
      }

      // Gemini accepts PDFs as native inline data and performs page-aware
      // extraction. Keeping the bytes intact is more reliable than pretending
      // that a PDF is UTF-8 text.
      if (isPdf) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return {
          success: true,
          name,
          size,
          mimeType: 'application/pdf',
          base64,
          message: `Loaded PDF “${name}” for page-aware Gemini analysis.`,
        };
      }

      let textContent = '';
      try {
        if (isDocx) {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const zip = await JSZip.loadAsync(base64, { base64: true });
          const xml = await zip.file('word/document.xml')?.async('string');
          if (!xml) throw new Error('DOCX document.xml is missing');
          textContent = xml
            .replace(/<w:tab\/?\s*>/g, '\t')
            .replace(/<\/w:p>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        } else {
          textContent = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        }
      } catch (error: any) {
        return {
          success: false,
          name,
          size,
          mimeType,
          message: `Could not extract “${name}”: ${error?.message || error}`,
        };
      }

      const snippet = textContent.slice(0, 12_000);

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
