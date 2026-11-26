const IN = {
  name: 'Breathe in',
  hint: 'Slowly breathe in through your nose',
  scale: 'scale-110 bg-sky',
};
const HOLD_FULL = {
  name: 'Hold',
  hint: 'Hold it gently, no need to tense up',
  scale: 'scale-110 bg-lavender',
};
const OUT = {
  name: 'Breathe out',
  hint: 'Let it out slowly through your mouth',
  scale: 'scale-95 bg-mint',
};
const HOLD_EMPTY = {
  name: 'Hold',
  hint: 'Rest here for a moment before the next breath',
  scale: 'scale-95 bg-lavender',
};

export type BreathingPatternId = '4-7-8' | 'box' | 'slow';

export interface BreathingPattern {
  label: string;
  intro: string;
  phases: { name: string; hint: string; scale: string; duration: number }[];
}

/** Each technique the AI can suggest gets its own rhythm, so the orb matches the card. */
export const BREATHING_PATTERNS: Record<BreathingPatternId, BreathingPattern> = {
  '4-7-8': {
    label: '4-7-8',
    intro: 'Press Start and follow along: in for 4, hold for 7, out for 8.',
    phases: [
      { ...IN, duration: 4 },
      { ...HOLD_FULL, duration: 7 },
      { ...OUT, duration: 8 },
    ],
  },
  box: {
    label: '4-4-4-4',
    intro: 'Press Start and trace a box: in for 4, hold for 4, out for 4, hold for 4.',
    phases: [
      { ...IN, duration: 4 },
      { ...HOLD_FULL, duration: 4 },
      { ...OUT, duration: 4 },
      { ...HOLD_EMPTY, duration: 4 },
    ],
  },
  slow: {
    label: '4-6',
    intro: 'Press Start and slow it down: in for 4, then a long, easy breath out for 6.',
    phases: [
      { ...IN, duration: 4 },
      { ...OUT, duration: 6 },
    ],
  },
};

/** Reads which technique a cope card describes from its title and guidance. */
export function pickBreathingPattern(text = ''): BreathingPatternId {
  const t = text.toLowerCase();
  if (t.includes('4-7-8')) return '4-7-8';
  if (t.includes('box') || t.includes('4-4-4-4') || /hold for 4\b.*hold for 4\b/.test(t))
    return 'box';
  return 'slow';
}

const cycleLength = (pattern: BreathingPatternId) =>
  BREATHING_PATTERNS[pattern].phases.reduce((sum, ph) => sum + ph.duration, 0);

export function getBreathingPhase(elapsedSeconds: number, pattern: BreathingPatternId = '4-7-8') {
  const { phases } = BREATHING_PATTERNS[pattern];
  let pos = elapsedSeconds % cycleLength(pattern);
  for (const phase of phases) {
    if (pos < phase.duration) return { phase, phaseRemaining: phase.duration - pos };
    pos -= phase.duration;
  }
  return { phase: phases[0], phaseRemaining: phases[0].duration };
}
