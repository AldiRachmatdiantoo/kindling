import { describe, expect, it } from 'vitest';
import { CHECKIN_QUESTIONS } from './constants';
import { energyLevel, pillarEndingAt, pillarEnergy, previewScores, previewTier } from './reading';

describe('check-in reading preview', () => {
  it('ends each pillar at its last question', () => {
    const ends = CHECKIN_QUESTIONS.map((_, i) => pillarEndingAt(i));
    expect(ends).toEqual([null, null, 'physical', null, null, null, 'work', null, 'soul']);
  });

  it('scores and tiers like the server (scorer.go)', () => {
    const all = (v: number) =>
      Object.fromEntries(CHECKIN_QUESTIONS.map((q) => [q.key, v])) as Record<string, number>;
    // Everything at "Very much": exhausted body, so gentle
    const heavy = previewScores(all(4));
    expect(heavy).toEqual({
      physical_exhaustion: 100,
      work_exhaustion: 100,
      disengagement: 100,
      soul_wellbeing: 100,
    });
    expect(previewTier(heavy)).toBe('gentle');
    // Rested and present, in good spirits: standard
    const light = previewScores({ ...all(1), who5_1: 4, who5_2: 4 });
    expect(previewTier(light)).toBe('standard');
    // Only low mood tips it to balanced
    expect(previewTier(previewScores(all(1)))).toBe('balanced');
  });

  it('reads energy so higher is always better', () => {
    const s = previewScores({
      cbi_1: 4,
      cbi_2: 4,
      cbi_3: 4,
      olbi_ex_1: 1,
      olbi_ex_2: 1,
      olbi_dis_1: 3,
      olbi_dis_2: 3,
      who5_1: 4,
      who5_2: 4,
    });
    expect(pillarEnergy('physical', s)).toBe(0);
    expect(pillarEnergy('work', s)).toBe(33);
    expect(pillarEnergy('soul', s)).toBe(100);
    expect([0, 33, 34, 66, 67].map(energyLevel)).toEqual(['low', 'low', 'mid', 'mid', 'high']);
  });
});
