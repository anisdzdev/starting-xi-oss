import { describe, expect, it } from 'vitest';

import {
  applyMention,
  extractMentions,
  findMentionQuery,
  matchMembers,
  splitMentions,
} from './mentions';

const members = [
  { id: 'a', name: 'Anis' },
  { id: 'r', name: 'Rival Rik' },
  { id: 'k', name: 'Rik' },
  { id: 'x', name: 'Al' },
  { id: 'y', name: 'Alex' },
];

describe('findMentionQuery', () => {
  it('detects a fresh @-token at the cursor', () => {
    const t = 'hey @An';
    expect(findMentionQuery(t, t.length)).toEqual({ start: 4, query: 'An' });
  });
  it('detects an empty token right after @', () => {
    const t = 'yo @';
    expect(findMentionQuery(t, t.length)).toEqual({ start: 3, query: '' });
  });
  it('returns null once the token is closed by a space', () => {
    const t = 'hey @Anis ';
    expect(findMentionQuery(t, t.length)).toBeNull();
  });
  it('returns null when @ is mid-word (email)', () => {
    const t = 'mail me a@b';
    expect(findMentionQuery(t, t.length)).toBeNull();
  });
});

describe('applyMention', () => {
  it('replaces the in-progress token with "@Name "', () => {
    const t = 'hey @Ri';
    const r = applyMention(t, t.length, { id: 'r', name: 'Rival Rik' });
    expect(r.text).toBe('hey @Rival Rik ');
    expect(r.cursor).toBe(r.text.length);
  });
  it('keeps trailing text after the cursor', () => {
    const t = 'hey @Ri!';
    const r = applyMention(t, 7, { id: 'r', name: 'Rival Rik' });
    expect(r.text).toBe('hey @Rival Rik !');
  });
});

describe('extractMentions', () => {
  it('prefers the longest matching name', () => {
    expect(extractMentions('yo @Rival Rik nice', members)).toEqual(['r']);
  });
  it('matches the exact short name, not the longer one', () => {
    expect(extractMentions('hi @Rik', members)).toEqual(['k']); // "Rik", not "Rival Rik"
  });
  it('does not match a name inside a longer word', () => {
    expect(extractMentions('hi @Alex', members)).toEqual(['y']);
    expect(extractMentions('hi @Alex', members)).not.toContain('x'); // "Al" must not match
  });
  it('returns [] with no mentions', () => {
    expect(extractMentions('nothing here', members)).toEqual([]);
  });
});

describe('splitMentions', () => {
  it('splits plain and mention segments', () => {
    const segs = splitMentions('yo @Anis gg', members);
    expect(segs.map((s) => s.text)).toEqual(['yo ', '@Anis', ' gg']);
    expect(segs[1].member?.id).toBe('a');
  });
  it('handles a multi-word mention', () => {
    const segs = splitMentions('@Rival Rik!', members);
    expect(segs[0].member?.id).toBe('r');
    expect(segs[0].text).toBe('@Rival Rik');
    expect(segs[1].text).toBe('!');
  });
});

describe('matchMembers', () => {
  it('ranks startsWith before includes', () => {
    const r = matchMembers('ri', members);
    expect(r[0].name).toBe('Rik'); // "Rik" starts with "ri" (localeCompare tiebreak: Rik < Rival Rik)
  });
  it('is case-insensitive and capped', () => {
    expect(matchMembers('a', members, 2).length).toBe(2);
  });
});
