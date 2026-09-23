import { splitBlocks, tokenizeInline } from '../src/core/markdown';

describe('markdown — tokenizeInline', () => {
  it('extracts bold, italic, inline code and links without leaving markers', () => {
    const tokens = tokenizeInline('This is **bold**, this is *italic*, `code` and [a link](https://x.com).');
    expect(tokens.find((t) => t.kind === 'bold')?.value).toBe('bold');
    expect(tokens.find((t) => t.kind === 'italic')?.value).toBe('italic');
    expect(tokens.find((t) => t.kind === 'code')?.value).toBe('code');
    const link = tokens.find((t) => t.kind === 'link');
    expect(link).toMatchObject({ value: 'a link', href: 'https://x.com' });
  });

  it('passes plain text through untouched', () => {
    const tokens = tokenizeInline('Nothing special here.');
    expect(tokens).toEqual([{ kind: 'text', value: 'Nothing special here.' }]);
  });
});

describe('markdown — splitBlocks', () => {
  it('separates a fenced code block from surrounding paragraphs', () => {
    const blocks = splitBlocks('Before.\n\n```js\nconsole.log(1)\n```\n\nAfter.');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'code', 'paragraph']);
    const code = blocks[1];
    if (code.kind === 'code') {
      expect(code.language).toBe('js');
      expect(code.code).toBe('console.log(1)');
    }
  });

  it('groups consecutive bullet lines into one unordered list block', () => {
    const blocks = splitBlocks('- first\n- second\n- third');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false, items: ['first', 'second', 'third'] });
  });

  it('groups consecutive numbered lines into an ordered list block', () => {
    const blocks = splitBlocks('1. one\n2. two');
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: true, items: ['one', 'two'] });
  });

  it('recognises headings up to level 3', () => {
    const blocks = splitBlocks('# Title\n## Subtitle\n### Small');
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'heading', level: 2, text: 'Subtitle' },
      { kind: 'heading', level: 3, text: 'Small' },
    ]);
  });
});
