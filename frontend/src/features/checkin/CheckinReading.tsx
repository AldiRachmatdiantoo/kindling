import { ArrowRight } from 'lucide-react';
import { m, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { CalibrationTier, Pillar } from '../../api/types';
import { Mascot, PILLAR_MASCOT, type MascotMood } from '../../components/Mascot';
import { TIER_META, TIER_MOOD } from '../today/tier';
import {
  PILLAR_ORDER,
  energyLevel,
  pillarEnergy,
  type EnergyLevel,
  type PreviewScores,
} from './reading';
import { Button } from '@/components/watermelon-ui/button';

/** How long the meter "searches" before it settles on the reading. */
const READING_MS = 1600;

export const PILLAR_META: Record<
  Pillar,
  { label: string; about: string; bar: string; dot: string; levels: Record<EnergyLevel, string> }
> = {
  physical: {
    label: 'Physical',
    about: 'how your body feels',
    bar: 'bg-peach-strong',
    dot: 'bg-peach-strong',
    levels: { low: 'Running on empty', mid: 'Half a tank', high: 'Well charged' },
  },
  work: {
    label: 'Work',
    about: 'how drained, and how connected, you feel at work or study',
    bar: 'bg-sun-strong',
    dot: 'bg-sun-strong',
    levels: { low: 'Stretched thin', mid: 'Carrying some weight', high: 'Steady and engaged' },
  },
  soul: {
    label: 'Soul',
    about: 'your mood today',
    bar: 'bg-mint-strong',
    dot: 'bg-mint-strong',
    levels: { low: 'Running dim', mid: 'Doing okay', high: 'Glowing' },
  },
};

const LEVEL_MOOD: Record<EnergyLevel, MascotMood> = { low: 'sleepy', mid: 'calm', high: 'happy' };

const LEVEL_NOTE: Record<Pillar, Record<EnergyLevel, string>> = {
  physical: {
    low: 'Your body is asking for rest. I will keep anything physical very light.',
    mid: 'Some fuel in the tank, not a full one. Nothing too heavy, then.',
    high: 'Your body has energy to spare today. Nice.',
  },
  work: {
    low: 'Work is taking a lot out of you right now. That counts for a lot.',
    mid: 'Work is weighing on you a bit. We can make it lighter.',
    high: 'You still feel present in your work. That helps.',
  },
  soul: {
    low: 'Your mood is low today. Small kind things will matter most.',
    mid: 'Your heart is doing alright. Let us keep it that way.',
    high: 'You are in good spirits. Let us keep that going.',
  },
};

/** 'reading' while the meter searches, then 'done'. Instant under reduced motion. */
function useReadingPhase() {
  const reduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDone(true), reduceMotion ? 0 : READING_MS);
    return () => window.clearTimeout(t);
  }, [reduceMotion]);
  return { done, reduceMotion };
}

/** Focus the continue button once it appears, so keyboard users can move straight on. */
function useFocusWhen(ready: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ready) ref.current?.focus();
  }, [ready]);
  return ref;
}

function Meter({
  value,
  barClass,
  searching,
  reduceMotion,
  delay = 0,
}: {
  value: number;
  barClass: string;
  searching: boolean;
  reduceMotion: boolean | null;
  delay?: number;
}) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
      <m.div
        className={`h-full rounded-full ${barClass}`}
        initial={{ width: '0%' }}
        animate={
          searching && !reduceMotion
            ? { width: ['12%', '78%', '30%', '64%', '44%'] }
            : { width: `${Math.max(4, value)}%` }
        }
        transition={
          searching && !reduceMotion
            ? { duration: READING_MS / 1000, ease: 'easeInOut', delay }
            : reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 140, damping: 18 }
        }
      />
    </div>
  );
}

function ReadingDots() {
  return (
    <span className="ml-1.5 inline-flex gap-0.5 align-middle" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          className="h-1 w-1 rounded-full bg-current"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}

/**
 * Shown after the last question of a pillar: the pillar's character "reads" the answers
 * (the meter searches back and forth), then settles on an early read of that pillar.
 */
export function PillarReading({
  pillar,
  scores,
  isLast,
  onContinue,
}: {
  pillar: Pillar;
  scores: PreviewScores;
  isLast: boolean;
  onContinue: () => void;
}) {
  const { done, reduceMotion } = useReadingPhase();
  const continueRef = useFocusWhen(done);
  const meta = PILLAR_META[pillar];
  const energy = pillarEnergy(pillar, scores);
  const level = energyLevel(energy);
  const index = PILLAR_ORDER.indexOf(pillar) + 1;

  return (
    <section
      className="k-step-next rounded-3xl border border-line bg-surface p-6 text-center"
      data-testid={`checkin-reading-${pillar}`}
      aria-labelledby="pillar-reading-title"
    >
      <p className="text-xs font-semibold text-ink-faint">
        Pillar {index} of {PILLAR_ORDER.length} done
      </p>
      <m.div
        className="mt-3 flex justify-center"
        animate={
          done || reduceMotion ? { y: 0, rotate: 0 } : { y: [0, -6, 0], rotate: [0, -4, 4, 0] }
        }
        transition={done ? { type: 'spring' } : { duration: 0.8, repeat: Infinity }}
      >
        <Mascot pillar={pillar} mood={done ? LEVEL_MOOD[level] : 'cheer'} className="h-24 w-20" />
      </m.div>
      <h2 id="pillar-reading-title" className="mt-3 font-serif text-xl font-bold text-ink">
        {done ? (
          <>
            {meta.label}: {meta.levels[level]}
          </>
        ) : (
          <span>
            {PILLAR_MASCOT[pillar].name} is reading your {meta.label.toLowerCase()} answers
            <ReadingDots />
          </span>
        )}
      </h2>

      <div className="mx-auto mt-4 max-w-sm">
        <Meter value={energy} barClass={meta.bar} searching={!done} reduceMotion={reduceMotion} />
        <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-ink-faint">
          <span>Low</span>
          <span>{done ? `${energy}% energy` : 'Reading...'}</span>
          <span>High</span>
        </div>
      </div>

      <div aria-live="polite" className="min-h-[5.5rem]">
        {done && (
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }
            }
          >
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
              {LEVEL_NOTE[pillar][level]}
            </p>
            <Button
              ref={continueRef}
              onClick={onContinue}
              className="mt-5 w-full"
              data-testid="reading-continue"
            >
              {isLast ? 'See the full picture' : `On to ${PILLAR_META[PILLAR_ORDER[index]].label}`}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </m.div>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-faint">An early read, not a diagnosis.</p>
    </section>
  );
}

/**
 * After every question: the three pillar reads line up, Ember weighs them, and the day's
 * energy mode is revealed. Uses the same rules as the server, which confirms it on submit.
 */
export function DayConclusion({
  scores,
  tier,
  onContinue,
}: {
  scores: PreviewScores;
  tier: CalibrationTier;
  onContinue: () => void;
}) {
  const { done, reduceMotion } = useReadingPhase();
  const continueRef = useFocusWhen(done);
  const tierMeta = TIER_META[tier];

  return (
    <section
      className="k-step-next rounded-3xl border border-line bg-surface p-6"
      data-testid="checkin-conclusion"
      aria-labelledby="conclusion-title"
    >
      <div className="text-center">
        <m.div
          className="flex justify-center"
          animate={done || reduceMotion ? { scale: 1 } : { scale: [1, 1.06, 1] }}
          transition={
            done
              ? { type: 'spring', stiffness: 300, damping: 14 }
              : { duration: 0.9, repeat: Infinity }
          }
        >
          <Mascot mood={done ? TIER_MOOD[tier] : 'cheer'} className="h-24 w-20" />
        </m.div>
        <h2 id="conclusion-title" className="mt-3 font-serif text-xl font-bold text-ink">
          {done ? (
            "Here's your day"
          ) : (
            <span>
              Putting it all together
              <ReadingDots />
            </span>
          )}
        </h2>
      </div>

      <ul className="mt-5 space-y-3">
        {PILLAR_ORDER.map((pillar, i) => {
          const meta = PILLAR_META[pillar];
          const energy = pillarEnergy(pillar, scores);
          return (
            <m.li
              key={pillar}
              initial={reduceMotion ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15, type: 'spring', stiffness: 300, damping: 26 }}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden="true" />
                  {meta.label}
                </span>
                <span className="text-xs font-semibold text-ink-soft">
                  {meta.levels[energyLevel(energy)]}
                </span>
              </div>
              <Meter
                value={energy}
                barClass={meta.bar}
                searching={false}
                reduceMotion={reduceMotion}
              />
            </m.li>
          );
        })}
      </ul>

      <div aria-live="polite" className="min-h-[9rem]">
        {done && (
          <m.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="mt-6 rounded-2xl border border-line bg-surface-2 p-4 text-center"
            data-testid="conclusion-tier"
          >
            <p className="text-xs font-semibold text-ink-faint">Today you're in</p>
            <span
              className={`mt-1.5 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${tierMeta.badgeClass}`}
            >
              {tierMeta.label}
            </span>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
              {tierMeta.desc} Your 3 Daily Wins will be sized to match.
            </p>
          </m.div>
        )}
      </div>

      {done && (
        <Button
          ref={continueRef}
          onClick={onContinue}
          className="mt-5 w-full"
          data-testid="conclusion-continue"
        >
          Continue
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
      <p className="mt-3 text-center text-xs text-ink-faint">Not a clinical diagnosis tool.</p>
    </section>
  );
}
