import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { documentAnalysisService } from '../src/services/documentAnalysisService';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const picker = DocumentPicker.getDocumentAsync as jest.Mock;

describe('documentAnalysisService', () => {
  beforeEach(() => {
    (FileSystem as any).__resetMockFS?.();
    picker.mockReset();
  });

  it('extracts readable text from a DOCX container', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<w:document><w:body><w:p><w:r><w:t>Hello &amp; bienvenue</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r></w:p></w:body></w:document>'
    );
    const base64 = await zip.generateAsync({ type: 'base64' });
    const uri = 'file:///mock/cache/report.docx';
    await FileSystem.writeAsStringAsync(uri, base64);
    picker.mockResolvedValue({
      canceled: false,
      assets: [{ uri, name: 'report.docx', size: base64.length, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
    });

    const result = await documentAnalysisService.pickAndReadDocument();
    expect(result.success).toBe(true);
    expect(result.textSnippet).toContain('Hello & bienvenue');
    expect(result.textSnippet).toContain('Second line');
  });

  it('keeps PDF bytes intact for Gemini instead of decoding them as text', async () => {
    const uri = 'file:///mock/cache/report.pdf';
    const base64 = 'JVBERi0xLjQK';
    await FileSystem.writeAsStringAsync(uri, base64);
    picker.mockResolvedValue({
      canceled: false,
      assets: [{ uri, name: 'report.pdf', size: 9, mimeType: 'application/pdf' }],
    });

    const result = await documentAnalysisService.pickAndReadDocument();
    expect(result.success).toBe(true);
    expect(result.base64).toBe(base64);
    expect(result.textSnippet).toBeUndefined();
  });

  it('rejects unsupported binary formats honestly', async () => {
    picker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///mock/cache/archive.zip', name: 'archive.zip', size: 10, mimeType: 'application/zip' }],
    });
    const result = await documentAnalysisService.pickAndReadDocument();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not a supported/i);
  });
});
