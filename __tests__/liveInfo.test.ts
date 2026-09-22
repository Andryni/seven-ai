/**
 * The RSS extractor is regex-based on purpose (no XML dependency pulled into
 * an OTA-able bundle), so it must be pinned down: real feeds encode titles as
 * CDATA (Le Monde), plain text (RFI/BBC), and omit fields entirely.
 */
import { parseFeed } from '../src/services/liveInfoService';

describe('RSS feed parsing', () => {
  it('extracts items with source, link and date', () => {
    const xml = `<rss><channel>
      <item><title>Guerre en Ukraine : dernières nouvelles</title><link>https://exemple.fr/a</link><pubDate>Mon, 22 Sep 2026 06:00:00 GMT</pubDate></item>
      <item><title>Mbappé : « Je n'ai jamais coupé le lien »</title><link>https://exemple.fr/b</link></item>
    </channel></rss>`;
    const items = parseFeed(xml, 'RFI');
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'Guerre en Ukraine : dernières nouvelles',
      source: 'RFI',
      published: 'Mon, 22 Sep 2026 06:00:00 GMT',
      link: 'https://exemple.fr/a',
    });
    expect(items[1].published).toBeUndefined();
  });

  it('unwraps CDATA titles (Le Monde style) and strips inner markup', () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[En Seine-et-Marne, « on sent la vague »]]></title><link>https://lemonde.fr/x</link></item>
      <item><title>Bourse: <b>relance</b> &amp; stabilisation</title></item>
    </channel></rss>`;
    const items = parseFeed(xml, 'Le Monde');
    expect(items[0].title).toBe('En Seine-et-Marne, « on sent la vague »');
    expect(items[1].title).toBe('Bourse: relance & stabilisation');
  });

  it('reads Atom entries: link lives in an href attribute, date in updated', () => {
    const xml = `<feed>
      <entry><title>Atom item</title><link href="https://atom.dev/1" /><updated>2026-09-22T10:00:00Z</updated></entry>
    </feed>`;
    const items = parseFeed(xml, 'Atom');
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe('https://atom.dev/1');
    expect(items[0].published).toBe('2026-09-22T10:00:00Z');
  });

  it('skips items without a title instead of producing blanks', () => {
    const xml = `<rss><channel>
      <item><link>https://x.fr/1</link></item>
      <item><title>Valide</title></item>
    </channel></rss>`;
    const items = parseFeed(xml, 'Test');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Valide');
  });

  it('caps extraction at 12 items per feed', () => {
    const items = Array.from({ length: 30 }, (_, i) => `<item><title>N${i}</title></item>`).join('');
    expect(parseFeed(`<rss><channel>${items}</channel></rss>`, 'X')).toHaveLength(12);
  });
});
