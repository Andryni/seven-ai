/**
 * Android "Share ->" targeting SEVEN used to not exist at all. This pins
 * the classification logic that turns a raw ShareIntent payload (text,
 * link, image, document, or several files at once) into the single
 * actionable kind SEVEN's chat screen consumes, plus the text-extraction
 * and localized prompt-building steps that follow.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { shareIntentService } from '../src/services/shareIntentService';
import type { ShareIntent } from 'expo-share-intent';

function file(overrides: Partial<ShareIntent['files'] extends (infer T)[] | null ? T : never> = {}) {
  return {
    fileName: 'shared.txt',
    mimeType: 'text/plain',
    path: 'file:///cache/shared.txt',
    size: 100,
    width: null,
    height: null,
    duration: null,
    ...overrides,
  };
}

describe('shareIntentService.classify', () => {
  it('returns empty for a null/undefined intent', () => {
    expect(shareIntentService.classify(null)).toEqual({ kind: 'empty' });
    expect(shareIntentService.classify(undefined)).toEqual({ kind: 'empty' });
  });

  it('returns empty when the intent has neither text, url, nor files', () => {
    expect(shareIntentService.classify({ text: null, webUrl: null, files: null, type: null })).toEqual({
      kind: 'empty',
    });
  });

  it('classifies a shared image file as kind "image"', () => {
    const result = shareIntentService.classify({
      text: null,
      webUrl: null,
      type: 'media',
      files: [file({ mimeType: 'image/jpeg', path: 'file:///cache/photo.jpg' })],
    });
    expect(result).toMatchObject({ kind: 'image', uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg' });
  });

  it('carries a caption alongside a shared image when text differs from any url', () => {
    const result = shareIntentService.classify({
      text: 'Look at this!',
      webUrl: null,
      type: 'media',
      files: [file({ mimeType: 'image/png' })],
    });
    expect(result).toMatchObject({ kind: 'image', caption: 'Look at this!' });
  });

  it('classifies a shared non-image file as kind "document"', () => {
    const result = shareIntentService.classify({
      text: null,
      webUrl: null,
      type: 'file',
      files: [file({ fileName: 'report.pdf', mimeType: 'application/pdf', path: 'file:///cache/report.pdf' })],
    });
    expect(result).toMatchObject({
      kind: 'document',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      uri: 'file:///cache/report.pdf',
    });
  });

  it('reports multiple shared files as "unsupported" instead of silently dropping some', () => {
    const result = shareIntentService.classify({
      text: null,
      webUrl: null,
      type: 'file',
      files: [file({ fileName: 'a.txt' }), file({ fileName: 'b.txt' })],
    });
    expect(result.kind).toBe('unsupported');
    if (result.kind === 'unsupported') {
      expect(result.reason).toMatch(/2 files/);
    }
  });

  it('classifies a shared web link as kind "link" and strips the url from the caption', () => {
    const result = shareIntentService.classify({
      text: 'Check this out: https://example.com/article',
      webUrl: 'https://example.com/article',
      type: 'weburl',
      files: null,
    });
    expect(result).toMatchObject({ kind: 'link', url: 'https://example.com/article' });
    if (result.kind === 'link') {
      expect(result.caption).toBe('Check this out:');
    }
  });

  it('classifies a link with no extra text as kind "link" with no caption', () => {
    const result = shareIntentService.classify({
      text: 'https://example.com',
      webUrl: 'https://example.com',
      type: 'weburl',
      files: null,
    });
    expect(result).toMatchObject({ kind: 'link', url: 'https://example.com', caption: undefined });
  });

  it('classifies plain shared text with no url/files as kind "text"', () => {
    const result = shareIntentService.classify({
      text: 'Remember to buy milk',
      webUrl: null,
      type: 'text',
      files: null,
    });
    expect(result).toEqual({ kind: 'text', text: 'Remember to buy milk' });
  });

  it('prefers files over a coincidental text/url on the same intent', () => {
    const result = shareIntentService.classify({
      text: 'some caption',
      webUrl: null,
      type: 'file',
      files: [file({ mimeType: 'image/webp', path: 'file:///x.webp' })],
    });
    expect(result.kind).toBe('image');
  });
});

describe('shareIntentService.readDocumentText', () => {
  beforeEach(() => {
    (FileSystem as any).__resetMockFS?.();
  });

  it('reads and caps text content for a text/* mime type', async () => {
    await FileSystem.writeAsStringAsync('file:///cache/notes.txt', 'a'.repeat(5000));
    const result = await shareIntentService.readDocumentText({
      kind: 'document',
      uri: 'file:///cache/notes.txt',
      name: 'notes.txt',
      mimeType: 'text/plain',
      isBinary: false,
    });
    expect(result.isBinary).toBe(false);
    expect(result.textSnippet).toHaveLength(3500);
  });

  it('reports isBinary when the text-like file cannot be read', async () => {
    const result = await shareIntentService.readDocumentText({
      kind: 'document',
      uri: 'file:///cache/missing.txt',
      name: 'missing.txt',
      mimeType: 'text/plain',
      isBinary: false,
    });
    expect(result.isBinary).toBe(true);
    expect(result.textSnippet).toBeUndefined();
  });

  it('detects binary content decoded as UTF-8 garbage for an unknown mime type', async () => {
    await FileSystem.writeAsStringAsync('file:///cache/blob.bin', '\u0000\u0001\u0002binarydata\ufffd');
    const result = await shareIntentService.readDocumentText({
      kind: 'document',
      uri: 'file:///cache/blob.bin',
      name: 'blob.bin',
      mimeType: 'application/octet-stream',
      isBinary: false,
    });
    expect(result.isBinary).toBe(true);
  });

  it('still reads a plain text file even when tagged with a generic octet-stream mime type', async () => {
    await FileSystem.writeAsStringAsync('file:///cache/plain.dat', 'Hello, this is readable text.');
    const result = await shareIntentService.readDocumentText({
      kind: 'document',
      uri: 'file:///cache/plain.dat',
      name: 'plain.dat',
      mimeType: 'application/octet-stream',
      isBinary: false,
    });
    expect(result.isBinary).toBe(false);
    expect(result.textSnippet).toBe('Hello, this is readable text.');
  });
});

describe('shareIntentService.buildPrompt', () => {
  it('builds an English link summary prompt', () => {
    const prompt = shareIntentService.buildPrompt({ kind: 'link', url: 'https://example.com' }, 'en');
    expect(prompt).toContain('https://example.com');
    expect(prompt).toMatch(/Summarize/i);
  });

  it('builds a French link summary prompt including the caption', () => {
    const prompt = shareIntentService.buildPrompt(
      { kind: 'link', url: 'https://example.com', caption: 'Regarde ça' },
      'fr'
    );
    expect(prompt).toMatch(/Résume/i);
    expect(prompt).toContain('Regarde ça');
  });

  it('builds a text-help prompt wrapping the shared text', () => {
    const prompt = shareIntentService.buildPrompt({ kind: 'text', text: 'Buy milk' }, 'en');
    expect(prompt).toContain('Buy milk');
  });

  it('builds a document analysis prompt when text was extracted', () => {
    const prompt = shareIntentService.buildPrompt(
      { kind: 'document', uri: 'x', name: 'report.pdf', mimeType: 'application/pdf', textSnippet: 'Q3 results...', isBinary: false },
      'en'
    );
    expect(prompt).toContain('report.pdf');
    expect(prompt).toContain('Q3 results...');
  });

  it('builds a graceful fallback message for a binary document with no text', () => {
    const prompt = shareIntentService.buildPrompt(
      { kind: 'document', uri: 'x', name: 'photo.raw', mimeType: 'application/octet-stream', isBinary: true },
      'fr'
    );
    expect(prompt).toContain('photo.raw');
    expect(prompt).toMatch(/n'a pas pu être lu/i);
  });

  it('passes through the unsupported reason verbatim', () => {
    const prompt = shareIntentService.buildPrompt({ kind: 'unsupported', reason: 'too many files' }, 'en');
    expect(prompt).toBe('too many files');
  });
});
