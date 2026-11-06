// Pure @-mention helpers for the group chat — no React/Supabase, so they are
// unit-tested (mentions.test.ts). A "member" is any user who can be mentioned.

export type MentionMember = { id: string; name: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The @-token currently being typed: the run of non-space, non-@ characters
 * immediately before the cursor that follows an `@` (which itself is at the
 * start or right after whitespace). Returns null when the cursor isn't in a
 * fresh @-token. `start` is the index of the `@`.
 */
export function findMentionQuery(
  text: string,
  cursor: number
): { start: number; query: string } | null {
  const upto = text.slice(0, cursor);
  const m = upto.match(/(?:^|\s)@([^\s@]*)$/);
  if (!m) return null;
  const query = m[1];
  const start = cursor - query.length - 1; // position of the '@'
  return { start, query };
}

/**
 * Replace the in-progress @-token at `cursor` with `@<name> ` and return the new
 * text + where the cursor should land (just after the inserted trailing space).
 */
export function applyMention(
  text: string,
  cursor: number,
  member: MentionMember
): { text: string; cursor: number } {
  const found = findMentionQuery(text, cursor);
  const start = found ? found.start : cursor;
  const insert = `@${member.name} `;
  const next = text.slice(0, start) + insert + text.slice(cursor);
  return { text: next, cursor: start + insert.length };
}

/** Members sorted longest-name-first so "@Rival Rik" wins over "@Rik". */
function byNameLengthDesc(members: MentionMember[]): MentionMember[] {
  return [...members].sort((a, b) => b.name.length - a.name.length);
}

/**
 * The ids of every member whose `@<name>` appears in the body (case-insensitive,
 * bounded by end/space/punctuation so "@Al" can't match inside "@Alex").
 */
export function extractMentions(body: string, members: MentionMember[]): string[] {
  const ids: string[] = [];
  for (const m of byNameLengthDesc(members)) {
    if (!m.name) continue;
    const re = new RegExp(`(?:^|\\s)@${escapeRegExp(m.name)}(?=$|[\\s.,!?;:])`, 'i');
    if (re.test(body) && !ids.includes(m.id)) ids.push(m.id);
  }
  return ids;
}

export type MentionSegment = { text: string; member?: MentionMember };

/**
 * Split a body into plain + mention segments for rendering. Greedy left-to-right,
 * matching the longest known name at each `@`.
 */
export function splitMentions(body: string, members: MentionMember[]): MentionSegment[] {
  const sorted = byNameLengthDesc(members).filter((m) => m.name);
  const segments: MentionSegment[] = [];
  let buffer = '';
  let i = 0;
  const boundaryBefore = (idx: number) => idx === 0 || /\s/.test(body[idx - 1]);
  const boundaryAfter = (idx: number) => idx >= body.length || /[\s.,!?;:]/.test(body[idx]);

  while (i < body.length) {
    if (body[i] === '@' && boundaryBefore(i)) {
      const match = sorted.find((m) => {
        const token = `@${m.name}`;
        return (
          body.slice(i, i + token.length).toLowerCase() === token.toLowerCase() &&
          boundaryAfter(i + token.length)
        );
      });
      if (match) {
        if (buffer) {
          segments.push({ text: buffer });
          buffer = '';
        }
        segments.push({ text: body.slice(i, i + match.name.length + 1), member: match });
        i += match.name.length + 1;
        continue;
      }
    }
    buffer += body[i];
    i += 1;
  }
  if (buffer) segments.push({ text: buffer });
  return segments;
}

/** Members matching an in-progress query, best matches first, capped. */
export function matchMembers<T extends MentionMember>(
  query: string,
  members: T[],
  limit = 6
): T[] {
  const q = query.toLowerCase();
  const scored = members
    .filter((m) => m.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name);
    });
  return scored.slice(0, limit);
}
