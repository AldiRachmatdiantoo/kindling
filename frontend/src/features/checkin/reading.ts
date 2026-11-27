import type { CalibrationTier, CheckinAnswers, Pillar } from '../../api/types';
import { CHECKIN_QUESTIONS, type CheckinQuestion } from './constants';

/**
 * Client-side preview of the check-in scoring, so Ember can share an early read while the
 * user answers. It mirrors backend/internal/features/checkin/scorer.go exactly; the server
 * still computes the real result on submit.
 */

const DIMENSION_PILLAR: Record<CheckinQuestion['dimension'], Pillar> = {
  Physical: 'physical',
  'Work Exhaustion': 'work',
  Disengagement: 'work',
  Soul: 'soul',
};

export const PILLAR_ORDER: Pillar[] = ['physical', 'work', 'soul'];

export const pillarOfQuestion = (q: CheckinQuestion): Pillar => DIMENSION_PILLAR[q.dimension];

/** How many questions each pillar has, for the opening guide. */
export const PILLAR_QUESTION_COUNT: Record<Pillar, number> = CHECKIN_QUESTIONS.reduce(
  (acc, q) => ({ ...acc, [pillarOfQuestion(q)]: acc[pillarOfQuestion(q)] + 1 }),
  { physical: 0, work: 0, soul: 0 } as Record<Pillar, number>,
);

/** The pillar whose last question sits at this step, or null mid-pillar. */
export function pillarEndingAt(step: number): Pillar | null {
  const q = CHECKIN_QUESTIONS[step];
  if (!q) return null;
  const next = CHECKIN_QUESTIONS[step + 1];
  return !next || pillarOfQuestion(next) !== pillarOfQuestion(q) ? pillarOfQuestion(q) : null;
}

/** PRD §2.1: round((sum - n) / (3n) * 100). Unanswered items count as the lowest answer. */
function scoreItems(...items: Array<number | undefined>): number {
  const n = items.length;
  const sum = items.reduce<number>((s, v) => s + (v ?? 1), 0);
  return Math.round(((sum - n) / (3 * n)) * 100);
}

export interface PreviewScores {
  physical_exhaustion: number;
  work_exhaustion: number;
  disengagement: number;
  soul_wellbeing: number;
}

export function previewScores(a: Partial<CheckinAnswers>): PreviewScores {
  return {
    physical_exhaustion: scoreItems(a.cbi_1, a.cbi_2, a.cbi_3),
    work_exhaustion: scoreItems(a.olbi_ex_1, a.olbi_ex_2),
    disengagement: scoreItems(a.olbi_dis_1, a.olbi_dis_2),
    soul_wellbeing: scoreItems(a.who5_1, a.who5_2),
  };
}

/** Same rules, same order as DetermineTier in scorer.go. */
export function previewTier(s: PreviewScores): CalibrationTier {
  if (s.physical_exhaustion >= 67 || s.work_exhaustion >= 67) return 'gentle';
  if (
    s.physical_exhaustion >= 34 ||
    s.work_exhaustion >= 34 ||
    s.disengagement >= 34 ||
    s.soul_wellbeing <= 33
  ) {
    return 'balanced';
  }
  return 'standard';
}

/**
 * One 0..100 "energy left" number per pillar, higher is better everywhere: the body and
 * work scores measure strain, so they are flipped; work takes its heavier half.
 */
export function pillarEnergy(pillar: Pillar, s: PreviewScores): number {
  if (pillar === 'physical') return 100 - s.physical_exhaustion;
  if (pillar === 'work') return 100 - Math.max(s.work_exhaustion, s.disengagement);
  return s.soul_wellbeing;
}

export type EnergyLevel = 'low' | 'mid' | 'high';

/** The tier cut-offs (34 and 67) read from the energy side. */
export const energyLevel = (energy: number): EnergyLevel =>
  energy <= 33 ? 'low' : energy < 67 ? 'mid' : 'high';
