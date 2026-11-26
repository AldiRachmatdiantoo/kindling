import { Pause, Play, RotateCcw, Wind } from 'lucide-react';
import { useClockTimer } from './useClockTimer';
import { formatSecondsMMSS } from '../utils/date';
import { Button } from '@/components/watermelon-ui/button';

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

interface BreathingPattern {
  label: string;
  intro: string;
  phases: { name: string; hint: string; scale: string; duration: number }[];
}

/** Each technique the AI can suggest gets its own rhythm, so the circle matches the card. */
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

export interface BreathingPacerProps {
  durationSeconds: number;
  guidance?: string;
  /** Which rhythm to pace. Defaults to the classic 4-7-8. */
  pattern?: BreathingPatternId;
  /** Keeps the session going across page changes. Make it unique per activity and day. */
  persistKey?: string;
}

export function BreathingPacer({
  durationSeconds,
  guidance,
  pattern = '4-7-8',
  persistKey,
}: BreathingPacerProps) {
  const meta = BREATHING_PATTERNS[pattern];
  const safeDuration = Math.max(cycleLength(pattern), Math.floor(durationSeconds));
  const { elapsed, running, start, pause, reset } = useClockTimer(
    safeDuration,
    persistKey ? `${persistKey}:${pattern}` : undefined,
  );

  const remaining = Math.max(0, safeDuration - elapsed);
  const isFinished = remaining === 0;
  const { phase, phaseRemaining } = getBreathingPhase(elapsed, pattern);

  const handleReset = reset;

  return (
    <div className="k-card bg-sky/40 p-6" data-testid="breathing-pacer">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-ink">
          <Wind className="h-5 w-5 text-sky-strong" aria-hidden="true" />
          <h3 className="text-lg font-bold">
            Breathing Pacer <span className="whitespace-nowrap">({meta.label})</span>
          </h3>
        </div>
        <span className="k-chip font-mono tabular-nums" data-testid="breathing-remaining">
          {formatSecondsMMSS(remaining)}
        </span>
      </div>

      {guidance && <p className="mb-5 text-xs text-ink-soft">{guidance}</p>}

      <div className="flex flex-col items-center py-4">
        <div
          className={`flex h-40 w-40 flex-col items-center justify-center rounded-full border-[1.5px] border-ink transition-all duration-700 ${
            running ? phase.scale : 'scale-100 bg-surface'
          }`}
        >
          <span className="font-serif text-xl font-bold text-ink" data-testid="breathing-phase">
            {isFinished ? 'Done' : running ? phase.name : 'Ready'}
          </span>
          {!isFinished && (
            <span className="mt-1 font-mono text-2xl font-semibold text-ink-soft">
              {running ? `${phaseRemaining}s` : meta.label}
            </span>
          )}
        </div>
        <p className="mt-4 text-center text-sm text-ink-soft">
          {isFinished
            ? "That's the session. Notice how your shoulders sit a little lower now."
            : running
              ? phase.hint
              : meta.intro}
        </p>
      </div>

      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={() => (running ? pause() : start())} data-testid="breathing-toggle">
          {running ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          {running ? 'Pause' : isFinished ? 'Again' : 'Start'}
        </Button>
        <Button onClick={handleReset} data-testid="breathing-reset" variant="secondary">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset
        </Button>
      </div>
    </div>
  );
}
