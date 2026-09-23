import type { ShareIntent, ShareIntentFile } from 'expo-share-intent';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Turns the raw payload handed over by `expo-share-intent` (text, a shared
 * URL, one or more files coming from another app's "Share ->" menu) into
 * something SEVEN can act on: an image to analyze, a document snippet to
 * summarize, or a prompt built from shared text/link.
 *
 * Kept independent from the native module and from any React state so it
 * can be unit tested with plain fixtures instead of a mounted app tree.
 */

export type ClassifiedShareIntent =
  | { kind: 'empty' }
  | {
      kind: 'image';
      uri: string;
      mimeType: string;
      /** Optional caption/text shared alongside the image. */
      caption?: string;
    }
  | {
      kind: 'document';
      uri: string;
      name: string;
      mimeType: string;
      /** Extracted text, capped the same way documentAnalysisService caps its snippet. */
      textSnippet?: string;
      /** True when the file could not be read as text (binary format). */
      isBinary: boolean;
    }
  | { kind: 'link'; url: string; caption?: string }
  | { kind: 'text'; text: string }
  /** Multiple files/mixed content shared at once — summarized as a list. */
  | { kind: 'unsupported'; reason: string };

const IMAGE_MIME_PREFIX = 'image/';
const TEXT_LIKE_MIME_PATTERN = /^text\/|json$|xml$|csv$|markdown$/i;
const SNIPPET_MAX_CHARS = 3500;

function isImageFile(file: ShareIntentFile): boolean {
  return file.mimeType?.toLowerCase().startsWith(IMAGE_MIME_PREFIX) ?? false;
}

class ShareIntentService {
  private static instance: ShareIntentService;

  public static getInstance(): ShareIntentService {
    if (!ShareIntentService.instance) {
      ShareIntentService.instance = new ShareIntentService();
    }
    return ShareIntentService.instance;
  }

  /**
   * Classifies a raw `ShareIntent` into exactly one actionable kind. Only
   * the first file is used when several are shared at once (mirrors
   * documentAnalysisService/image picker, which are both single-item) — a
   * genuinely multi-file share is reported as `unsupported` with an
   * explanatory reason instead of silently dropping the extra files.
   */
  public classify(intent: ShareIntent | null | undefined): ClassifiedShareIntent {
    if (!intent) return { kind: 'empty' };

    const files = intent.files || [];
    const text = intent.text?.trim();
    const webUrl = intent.webUrl?.trim();

    if (files.length > 1) {
      return {
        kind: 'unsupported',
        reason: `${files.length} files were shared at once; SEVEN can only analyze one at a time. Please share a single file.`,
      };
    }

    if (files.length === 1) {
      const file = files[0];
      if (isImageFile(file)) {
        return {
          kind: 'image',
          uri: file.path,
          mimeType: file.mimeType || 'image/jpeg',
          caption: text && text !== webUrl ? text : undefined,
        };
      }
      return {
        kind: 'document',
        uri: file.path,
        name: file.fileName || 'shared-file',
        mimeType: file.mimeType || 'application/octet-stream',
        isBinary: false, // resolved by readDocumentText()
      };
    }

    if (webUrl) {
      // A shared link often comes with the source app's share text ("Check
      // this out: <url>") — keep it as a caption instead of discarding it.
      const caption = text && text !== webUrl ? text.replace(webUrl, '').trim() : undefined;
      return { kind: 'link', url: webUrl, caption: caption || undefined };
    }

    if (text) {
      return { kind: 'text', text };
    }

    return { kind: 'empty' };
  }

  /**
   * Reads a shared document file's text content (same 3500-char cap as
   * documentAnalysisService, so both entry points produce comparably sized
   * prompts). Non-text/binary files fail soft with `isBinary: true` instead
   * of throwing — a shared image mis-tagged as a generic file should still
   * produce a usable, if limited, result.
   */
  public async readDocumentText(
    doc: Extract<ClassifiedShareIntent, { kind: 'document' }>
  ): Promise<{ textSnippet?: string; isBinary: boolean }> {
    if (TEXT_LIKE_MIME_PATTERN.test(doc.mimeType)) {
      try {
        const content = await FileSystem.readAsStringAsync(doc.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        return { textSnippet: content.slice(0, SNIPPET_MAX_CHARS), isBinary: false };
      } catch {
        return { isBinary: true };
      }
    }

    // Unknown/binary mime type: still attempt a text read (some apps share
    // plain text files with a generic octet-stream mime type), but treat a
    // failure as expected rather than surfacing a scary error.
    try {
      const content = await FileSystem.readAsStringAsync(doc.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      // Binary content decoded as UTF8 usually contains the replacement
      // character or control bytes — a quick heuristic avoids feeding
      // garbage into the model as if it were readable text.
      // eslint-disable-next-line no-control-regex
      const looksBinary = /[\u0000-\u0008\u000e-\u001f\ufffd]/.test(content.slice(0, 1000));
      if (looksBinary) return { isBinary: true };
      return { textSnippet: content.slice(0, SNIPPET_MAX_CHARS), isBinary: false };
    } catch {
      return { isBinary: true };
    }
  }

  /**
   * Builds the exact chat prompt SEVEN should receive for a classified,
   * non-image share (image shares go through the vision path with the
   * caption as the prompt instead). Localized to the two languages the app
   * already ships with a matching default for anything else.
   */
  public buildPrompt(
    classified: Exclude<ClassifiedShareIntent, { kind: 'image' } | { kind: 'empty' }>,
    language: 'fr' | 'en'
  ): string {
    const isFr = language === 'fr';
    switch (classified.kind) {
      case 'link':
        return isFr
          ? `Résume ce lien partagé : ${classified.url}${classified.caption ? `\n\nNote : "${classified.caption}"` : ''}`
          : `Summarize this shared link: ${classified.url}${classified.caption ? `\n\nNote: "${classified.caption}"` : ''}`;
      case 'text':
        return isFr
          ? `On m'a partagé ce texte, aide-moi avec :\n\n"""\n${classified.text}\n"""`
          : `I was shared this text, help me with it:\n\n"""\n${classified.text}\n"""`;
      case 'document': {
        if (classified.isBinary || !classified.textSnippet) {
          return isFr
            ? `Un fichier "${classified.name}" m'a été partagé mais son contenu n'a pas pu être lu comme du texte (type: ${classified.mimeType}).`
            : `A file "${classified.name}" was shared with me but its content could not be read as text (type: ${classified.mimeType}).`;
        }
        return isFr
          ? `Analyse et résume ce document partagé "${classified.name}" :\n\n"""\n${classified.textSnippet}\n"""`
          : `Analyze and summarize this shared document "${classified.name}":\n\n"""\n${classified.textSnippet}\n"""`;
      }
      case 'unsupported':
        return classified.reason;
      default:
        return '';
    }
  }
}

export const shareIntentService = ShareIntentService.getInstance();
