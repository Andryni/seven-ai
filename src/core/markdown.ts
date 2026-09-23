/**
 * Pure Markdown parsing for chat answers — no React/React Native import so it
 * stays trivially unit-testable (see `src/components/MarkdownText.tsx` for
 * the renderer that consumes this).
 *
 * Intentionally not a full CommonMark engine: it covers exactly what Gemini
 * actually produces in short assistant replies — bold/italic/inline code,
 * links, fenced code blocks, bullet/numbered lists and up-to-h3 headings.
 */

export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; value: string; href: string };

/** Splits one line of text into bold/italic/code/link runs. */
export function tokenizeInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Order matters: code spans first (so ** inside `` isn't misread), then
  // links, then bold, then italic.
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', value: line.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: 'code', value: match[1] });
    } else if (match[2] !== undefined) {
      tokens.push({ kind: 'link', value: match[2], href: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ kind: 'bold', value: match[4] });
    } else if (match[5] !== undefined) {
      tokens.push({ kind: 'bold', value: match[5] });
    } else if (match[6] !== undefined) {
      tokens.push({ kind: 'italic', value: match[6] });
    } else if (match[7] !== undefined) {
      tokens.push({ kind: 'italic', value: match[7] });
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < line.length) {
    tokens.push({ kind: 'text', value: line.slice(lastIndex) });
  }
  return tokens;
}

export type MarkdownBlock =
  | { kind: 'code'; code: string; language?: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string };

/** Splits the whole message into fenced-code / list / heading / paragraph blocks. */
export function splitBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  let paragraphBuf: string[] = [];
  let listBuf: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraphBuf.length) {
      blocks.push({ kind: 'paragraph', text: paragraphBuf.join(' ').trim() });
      paragraphBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf.length) {
      blocks.push({ kind: 'list', ordered: listOrdered, items: listBuf });
      listBuf = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushParagraph();
      flushList();
      const language = fence[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ kind: 'code', code: codeLines.join('\n'), language });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      i++;
      continue;
    }

    const bulletItem = line.match(/^\s*[-*•]\s+(.*)$/);
    const numberedItem = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bulletItem || numberedItem) {
      flushParagraph();
      const ordered = !!numberedItem;
      if (listBuf.length && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      listBuf.push((bulletItem ? bulletItem[1] : numberedItem![1]).trim());
      i++;
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      i++;
      continue;
    }

    flushList();
    paragraphBuf.push(line.trim());
    i++;
  }
  flushParagraph();
  flushList();
  return blocks;
}
