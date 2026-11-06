import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseMatchDetails } from './parseMatchDetails.ts';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const load = (f: string) =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) as Record<string, any>;

const confirmed = load('mex-rsa-confirmed.json'); // started+finished → lineupType "standard"
const predicted = load('fra-sen-predicted.json'); // upcoming → lineupType "lastStarting11"

describe('parseMatchDetails', () => {
  it('maps a started match to a confirmed lineup', () => {
    const r = parseMatchDetails(confirmed, new Set(), 4667751);
    expect(r.lineupType).toBe('confirmed');
    expect(r.home.players).toHaveLength(11);
    expect(r.away.players).toHaveLength(11);
    expect(r.home.formation).toBeTruthy();
  });

  it('maps an upcoming match to a predicted lineup', () => {
    const r = parseMatchDetails(predicted, new Set(), 4667804);
    expect(r.lineupType).toBe('predicted');
    expect(r.home.players).toHaveLength(11);
  });

  it('passes through verticalLayout coords and shirt/name', () => {
    const r = parseMatchDetails(confirmed, new Set(), 4667751);
    const gk = r.home.players[0];
    expect(typeof gk.x).toBe('number');
    expect(typeof gk.y).toBe('number');
    expect(gk.name.length).toBeGreaterThan(0);
  });

  it('flags my players via the fotmob-id set', () => {
    const ref = parseMatchDetails(confirmed, new Set(), 4667751);
    const someId = ref.home.players[3].id;
    const r = parseMatchDetails(confirmed, new Set([someId]), 4667751);
    expect(r.home.players.find((p) => p.id === someId)?.isMine).toBe(true);
    expect(r.home.players.find((p) => p.id !== someId)?.isMine).toBe(false);
  });

  it('defaults points to null when no points map is given', () => {
    const r = parseMatchDetails(confirmed, new Set(), 4667751);
    expect(r.home.players.every((p) => p.points === null)).toBe(true);
  });

  it('attaches points from the fotmob-id→points map', () => {
    const ref = parseMatchDetails(confirmed, new Set(), 4667751);
    const scorerId = ref.home.players[2].id;
    const r = parseMatchDetails(confirmed, new Set(), 4667751, new Map([[scorerId, 7]]));
    expect(r.home.players.find((p) => p.id === scorerId)?.points).toBe(7);
    expect(r.home.players.find((p) => p.id !== scorerId)?.points).toBeNull();
  });

  it('returns ≤3 English news items with usable urls', () => {
    const r = parseMatchDetails(confirmed, new Set(), 4667751);
    expect(r.news.length).toBeLessThanOrEqual(3);
    for (const n of r.news) {
      expect(n.url).toMatch(/^https?:\/\//);
      expect(n.id.endsWith('_es')).toBe(false);
    }
  });

  it('counts goals and assists from performance events', () => {
    const r = parseMatchDetails(confirmed, new Set(), 4667751);
    const all = [...r.home.players, ...r.away.players];
    // Quiñones + Jiménez scored for Mexico; Lira + Alvarado assisted.
    expect(all.filter((p) => p.goals > 0).length).toBeGreaterThanOrEqual(2);
    expect(all.filter((p) => p.assists > 0).length).toBeGreaterThanOrEqual(2);
    // Nobody in this match scored a brace, so goals stay at 1.
    expect(all.every((p) => p.goals <= 1)).toBe(true);
  });

  it('flags the Man of the Match', () => {
    const r = parseMatchDetails(confirmed, new Set(), 4667751);
    const motm = [...r.home.players, ...r.away.players].filter((p) => p.isMotm);
    expect(motm).toHaveLength(1);
    expect(motm[0].goals).toBeGreaterThan(0); // Quiñones (scored + MOTM)
  });

  it('awards clean sheets to the side that conceded nothing (GK/DEF/MID only)', () => {
    const r = parseMatchDetails(confirmed, new Set(), 4667751); // Mexico 2–0 RSA
    // Mexico (home) kept a clean sheet → some outfield + keeper marked.
    expect(r.home.players.some((p) => p.cleanSheet)).toBe(true);
    // South Africa conceded 2 → nobody gets it.
    expect(r.away.players.every((p) => !p.cleanSheet)).toBe(true);
  });

  it('never awards a clean sheet before full time', () => {
    const r = parseMatchDetails(predicted, new Set(), 4667804);
    expect([...r.home.players, ...r.away.players].every((p) => !p.cleanSheet)).toBe(true);
  });

  it('builds the canonical fotmob url', () => {
    const r = parseMatchDetails(confirmed, new Set(), 4667751);
    expect(r.fotmobUrl).toBe('https://www.fotmob.com/match/4667751');
  });

  it('handles a missing lineup gracefully', () => {
    const r = parseMatchDetails({ content: {} }, new Set(), 999);
    expect(r.lineupType).toBeNull();
    expect(r.home.players).toEqual([]);
    expect(r.away.players).toEqual([]);
  });
});
