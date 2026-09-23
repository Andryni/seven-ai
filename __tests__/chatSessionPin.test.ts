/**
 * togglePinChatSession is the store side of History's pin/unpin action:
 * it flips `pinned` on exactly the targeted session, persists like every
 * other session mutation, and leaves everything else untouched.
 */
import { useSevenStore } from '../src/store/useSevenStore';
import type { ChatSession } from '../src/types';

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: overrides.id ?? 'sess-1',
  title: overrides.title ?? 'Test session',
  createdAt: overrides.createdAt ?? 1000,
  updatedAt: overrides.updatedAt ?? 1000,
  messages: overrides.messages ?? [],
  pinned: overrides.pinned,
});

describe('togglePinChatSession', () => {
  beforeEach(() => {
    useSevenStore.setState({ chatSessions: [] });
  });

  it('pins an unpinned session', () => {
    useSevenStore.setState({ chatSessions: [makeSession({ id: 'a' })] });
    useSevenStore.getState().togglePinChatSession('a');
    expect(useSevenStore.getState().chatSessions.find((s) => s.id === 'a')?.pinned).toBe(true);
  });

  it('unpins an already-pinned session', () => {
    useSevenStore.setState({ chatSessions: [makeSession({ id: 'a', pinned: true })] });
    useSevenStore.getState().togglePinChatSession('a');
    expect(useSevenStore.getState().chatSessions.find((s) => s.id === 'a')?.pinned).toBe(false);
  });

  it('only affects the targeted session, leaving siblings untouched', () => {
    useSevenStore.setState({
      chatSessions: [makeSession({ id: 'a' }), makeSession({ id: 'b', pinned: true })],
    });
    useSevenStore.getState().togglePinChatSession('a');
    const sessions = useSevenStore.getState().chatSessions;
    expect(sessions.find((s) => s.id === 'a')?.pinned).toBe(true);
    expect(sessions.find((s) => s.id === 'b')?.pinned).toBe(true);
  });

  it('is a no-op (no throw) for an id that does not exist', () => {
    useSevenStore.setState({ chatSessions: [makeSession({ id: 'a' })] });
    expect(() => useSevenStore.getState().togglePinChatSession('does-not-exist')).not.toThrow();
    expect(useSevenStore.getState().chatSessions).toHaveLength(1);
  });
});

describe('History pinned-first sort (the same logic app/history.tsx applies)', () => {
  const sortPinnedFirst = (sessions: ChatSession[]) =>
    [...sessions].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  it('moves pinned sessions to the top without reordering within each group', () => {
    const sessions = [
      makeSession({ id: 'newest', updatedAt: 300 }),
      makeSession({ id: 'pinned-older', updatedAt: 100, pinned: true }),
      makeSession({ id: 'middle', updatedAt: 200 }),
    ];
    const sorted = sortPinnedFirst(sessions);
    expect(sorted.map((s) => s.id)).toEqual(['pinned-older', 'newest', 'middle']);
  });

  it('is a stable no-op when nothing is pinned', () => {
    const sessions = [makeSession({ id: 'a' }), makeSession({ id: 'b' })];
    expect(sortPinnedFirst(sessions).map((s) => s.id)).toEqual(['a', 'b']);
  });
});
