import { chatExportService } from '../src/services/chatExportService';
import { ChatMessage } from '../src/types';

/**
 * The chat screen could copy/share a single bubble but never the whole
 * conversation, unlike the Research module (PDF export). This pins the
 * Markdown rendering (used both for the .md export and the title
 * derivation helper) so the export stays stable across refactors.
 */
describe('chatExportService', () => {
  const messages: ChatMessage[] = [
    { id: '1', sender: 'user', text: 'Organize my downloads folder', timestamp: 1000 },
    {
      id: '2',
      sender: 'seven',
      text: 'Done. 12 files sorted.',
      timestamp: 2000,
      toolCall: { name: 'organizer', status: 'completed', summary: 'Organized 12 files' },
    },
    { id: '3', sender: 'system', text: '', timestamp: 3000 },
  ];

  it('renders a readable Markdown transcript with sender labels and tool summaries', () => {
    const md = chatExportService.toMarkdown('My Chat', messages, 'en');
    expect(md).toContain('# My Chat');
    expect(md).toContain('**YOU**');
    expect(md).toContain('Organize my downloads folder');
    expect(md).toContain('**SEVEN**');
    expect(md).toContain('Done. 12 files sorted.');
    expect(md).toContain('🔧 Organized 12 files');
  });

  it('skips empty system messages with no text and no tool call', () => {
    const md = chatExportService.toMarkdown('My Chat', messages, 'en');
    // The empty system message contributes neither a SYSTÈME/SYSTEM label
    // block nor stray whitespace-only bullets.
    expect(md.match(/\*\*SYSTEM\*\*/g)).toBeNull();
  });

  it('localizes sender labels and export prose to French', () => {
    const md = chatExportService.toMarkdown('Ma Discussion', messages, 'fr');
    expect(md).toContain('**VOUS**');
    expect(md).toContain('Exporté le');
  });

  it('derives a title from the first user message, falling back when none exists', () => {
    expect(chatExportService.deriveTitle(messages, 'Fallback')).toBe('Organize my downloads folder');
    expect(chatExportService.deriveTitle([messages[1]], 'Fallback')).toBe('Fallback');
  });
});
