import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { ChatMessage, ChatSession } from '../types';
import { storageService } from './storageService';

/**
 * Exports a full conversation as PDF or Markdown — the chat could copy or
 * share a single bubble, but not the whole session, unlike the Research
 * module which already produces polished PDFs. This reuses that same
 * expo-print + expo-sharing pipeline for parity.
 */
class ChatExportService {
  private static instance: ChatExportService;

  private constructor() {}

  public static getInstance(): ChatExportService {
    if (!ChatExportService.instance) {
      ChatExportService.instance = new ChatExportService();
    }
    return ChatExportService.instance;
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private safeName(title: string): string {
    return title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 60) || 'conversation';
  }

  private senderLabel(sender: ChatMessage['sender'], lang: 'fr' | 'en'): string {
    if (sender === 'user') return lang === 'fr' ? 'VOUS' : 'YOU';
    if (sender === 'seven') return 'SEVEN';
    return lang === 'fr' ? 'SYSTÈME' : 'SYSTEM';
  }

  /** Renders a conversation as plain Markdown — used for both the .md file
   * export and as the text body handed to the native share sheet. */
  public toMarkdown(title: string, messages: ChatMessage[], lang: 'fr' | 'en' = 'en'): string {
    const dateStr = new Date().toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
    const lines: string[] = [`# ${title}`, '', `_${lang === 'fr' ? 'Exporté le' : 'Exported on'} ${dateStr}_`, ''];

    for (const msg of messages) {
      if (!msg.text.trim() && !msg.toolCall) continue;
      const label = this.senderLabel(msg.sender, lang);
      const time = new Date(msg.timestamp).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      lines.push(`**${label}** _(${time})_`);
      lines.push('');
      if (msg.text.trim()) lines.push(msg.text.trim());
      if (msg.toolCall?.summary) lines.push(`> 🔧 ${msg.toolCall.summary}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private toHtml(title: string, messages: ChatMessage[], lang: 'fr' | 'en'): string {
    const dateStr = new Date().toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
    const rows = messages
      .filter((m) => m.text.trim() || m.toolCall)
      .map((msg) => {
        const isUser = msg.sender === 'user';
        const label = this.escapeHtml(this.senderLabel(msg.sender, lang));
        const time = new Date(msg.timestamp).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const body = this.escapeHtml(msg.text || '').replace(/\n/g, '<br/>');
        const tool = msg.toolCall?.summary
          ? `<div class="tool">🔧 ${this.escapeHtml(msg.toolCall.summary)}</div>`
          : '';
        return `
      <div class="bubble ${isUser ? 'user' : 'seven'}">
        <div class="meta"><span class="label">${label}</span><span class="time">${time}</span></div>
        <div class="text">${body}</div>
        ${tool}
      </div>`;
      })
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this.escapeHtml(title)}</title>
  <style>
    @page { margin: 16mm; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1a202c;
      background: #ffffff;
      padding: 8px;
    }
    .header-bar {
      border-bottom: 3px solid #00e5ff;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .logo-text {
      font-size: 13px;
      font-weight: 800;
      color: #0987a0;
      letter-spacing: 2px;
      font-family: monospace;
    }
    h1 { font-size: 22px; margin: 6px 0 2px; }
    .date { font-size: 11px; color: #718096; font-family: monospace; }
    .bubble {
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
      max-width: 85%;
    }
    .bubble.user {
      background: #ebf8ff;
      border-left: 3px solid #3182ce;
      margin-left: 15%;
    }
    .bubble.seven {
      background: #f7fafc;
      border-left: 3px solid #00b894;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      font-family: monospace;
      font-size: 10px;
      color: #a0aec0;
      margin-bottom: 4px;
      font-weight: 700;
    }
    .text { font-size: 12.5px; line-height: 1.5; color: #2d3748; }
    .tool { font-size: 11px; color: #b7791f; margin-top: 6px; font-family: monospace; }
    .footer-bar {
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      font-size: 10px;
      color: #a0aec0;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="logo-text">SEVEN AI // CONVERSATION EXPORT</div>
    <h1>${this.escapeHtml(title)}</h1>
    <div class="date">${dateStr}</div>
  </div>
  ${rows}
  <div class="footer-bar">Exported from Seven AI · ${messages.length} messages</div>
</body>
</html>`;
  }

  /** Generates a PDF for the given session/messages and returns its local
   * file uri (or a data: uri on web, mirroring researchService). */
  public async exportToPdf(
    title: string,
    messages: ChatMessage[],
    lang: 'fr' | 'en' = 'en'
  ): Promise<string> {
    const html = this.toHtml(title, messages, lang);

    if (Platform.OS === 'web') {
      return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    }

    const { uri } = await Print.printToFileAsync({ html });
    const docDir = storageService.getDocumentDirectory();
    if (docDir) {
      const target = `${docDir}Downloads/Chat_${this.safeName(title)}.pdf`;
      try {
        await storageService.copy(uri, target);
        return target;
      } catch {
        return uri;
      }
    }
    return uri;
  }

  /** Writes a .md file for the given session/messages and returns its path. */
  public async exportToMarkdownFile(
    title: string,
    messages: ChatMessage[],
    lang: 'fr' | 'en' = 'en'
  ): Promise<string> {
    const markdown = this.toMarkdown(title, messages, lang);
    const docDir = storageService.getDocumentDirectory();
    const target = `${docDir}Downloads/Chat_${this.safeName(title)}.md`;
    try {
      await storageService.ensureDirectory(`${docDir}Downloads`);
    } catch {
      // best effort
    }
    await storageService.writeAsString(target, markdown);
    return target;
  }

  public async shareFile(uri: string, mimeType: string, dialogTitle: string): Promise<void> {
    try {
      if (Platform.OS !== 'web') {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, { mimeType, dialogTitle });
        }
      } else {
        window.open(uri, '_blank');
      }
    } catch (e) {
      console.warn('Share export error:', e);
    }
  }

  /** High-level convenience: builds a session title from its first user
   * message when the caller only has a raw message list (live chat screen,
   * which has no ChatSession object until it's archived). */
  public deriveTitle(messages: ChatMessage[], fallback: string): string {
    const firstUser = messages.find((m) => m.sender === 'user' && m.text.trim());
    if (!firstUser) return fallback;
    return firstUser.text.trim().replace(/\s+/g, ' ').slice(0, 60);
  }

  public async exportSessionToPdf(session: ChatSession, lang: 'fr' | 'en' = 'en'): Promise<string> {
    return this.exportToPdf(session.title, session.messages, lang);
  }

  public async exportSessionToMarkdown(session: ChatSession, lang: 'fr' | 'en' = 'en'): Promise<string> {
    return this.exportToMarkdownFile(session.title, session.messages, lang);
  }
}

export const chatExportService = ChatExportService.getInstance();
