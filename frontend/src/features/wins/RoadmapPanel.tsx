import { Check, Flag, RefreshCw, Shuffle, Sprout } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Pillar, WinItem } from '../../api/types';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Mascot, PILLAR_MASCOT } from '../../components/Mascot';
import { MascotBubble } from '../../components/MascotBubble';
import { Button } from '@/components/watermelon-ui/button';
import { PILLAR_META, timerKey } from './constants';
import { SwapToday } from './WinCard';

// A roadmap never grows past this many steps (mirrors the backend's MaxRoadmapSteps).
export const MAX_ROADMAP_STEPS = 8;

// The roadmap pillars keep their own signal color for the current step and the floor line.
const ACCENT: Record<
  'physical' | 'soul',
  { soft: string; strong: string; border: string; text: string }
> = {
  physical: {
    soft: 'bg-mint',
    strong: 'bg-mint-strong',
    border: 'border-mint-strong',
    text: 'text-mint-strong',
  },
  soul: {
    soft: 'bg-sky',
    strong: 'bg-sky-strong',
    border: 'border-sky-strong',
    text: 'text-sky-strong',
  },
};

/** True when a physical or soul win is a step-by-step roadmap with a floor step. */
export function isRoadmap(item: WinItem): boolean {
  const floor = item.floor_step ?? 0;
  return floor > 0 && floor <= (item.steps?.length ?? 0);
}

/** One short line for the win list: where this roadmap stands today. */
export function roadmapState(item: WinItem): string {
  const total = item.steps?.length ?? 0;
  const done = item.steps_done ?? 0;
  if (done >= total) return 'All done';
  if (done === 0) return 'Not started';
  const step = `Step ${done + 1} of ${total}`;
  return item.completed ? `Win in · ${step}` : step;
}

type Note = 'floor' | 'all' | 'stopped' | null;

export interface RoadmapPanelProps {
  pillar: 'physical' | 'soul';
  item: WinItem;
  logDate: string;
  userId: string | undefined;
  busy: boolean;
  /** Saves how many steps are done; resolves with an error message, or null. */
  onProgress: (pillar: Pillar, stepsDone: number) => Promise<string | null>;
  /** Splits the current step; resolves with an error message, or null. */
  onSplit: (pillar: Pillar, step: number) => Promise<string | null>;
  onRecalibrate: (pillar: Pillar) => void;
  isRecalibrating: boolean;
  onSwap: (pillar: Pillar, activity: string) => Promise<string | null>;
  isSwapping: boolean;
}

/**
 * A physical or soul win as a roadmap: the habit broken into small steps, one shown big at a
 * time. A floor line marks the step that already counts as today's win; stopping before it is
 * saved as "started", never as failure.
 */
export function RoadmapPanel({
  pillar,
  item,
  logDate,
  userId,
  busy,
  onProgress,
  onSplit,
  onRecalibrate,
  isRecalibrating,
  onSwap,
  isSwapping,
}: RoadmapPanelProps) {
  const accent = ACCENT[pillar];
  const steps = item.steps ?? [];
  const total = steps.length;
  const floor = item.floor_step ?? total;
  const done = Math.min(item.steps_done ?? 0, total);
  const allDone = done >= total;
  const winIn = done >= floor;

  const [whyOpen, setWhyOpen] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different win (a swap) starts with a clean slate.
  useEffect(() => {
    setNote(null);
    setStopped(false);
    setError(null);
  }, [item.title]);

  const advance = async () => {
    setError(null);
    const next = done + 1;
    const err = await onProgress(pillar, next);
    if (err) {
      setError(err);
      return;
    }
    setNote(next >= total ? 'all' : next === floor ? 'floor' : null);
  };

  const undo = async () => {
    setError(null);
    const err = await onProgress(pillar, done - 1);
    if (err) setError(err);
    else setNote(null);
  };

  const smaller = async () => {
    setError(null);
    const err = await onSplit(pillar, done);
    if (err) setError(err);
    else setNote(null);
  };

  const showTimer = !allDone && !stopped && done >= floor - 1 && Boolean(item.duration_seconds);

  return (
    <section
      className="rounded-3xl border border-line bg-surface p-5 sm:p-6"
      aria-label={`${PILLAR_META[pillar].label}: ${item.title}`}
      aria-busy={isRecalibrating || undefined}
      data-testid={`roadmap-${pillar}`}
    >
      <div className="flex items-center gap-3.5">
        <Mascot
          pillar={pillar}
          mood={item.completed ? 'cheer' : 'happy'}
          className="h-16 w-14 shrink-0"
        />
        <div className="min-w-0 flex-1">
          {item.habit ? (
            <span
              className={`inline-flex max-w-full items-center gap-1.5 text-xs font-bold ${accent.text}`}
              data-testid={`win-habit-${pillar}`}
            >
              {item.swapped ? (
                <Shuffle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Sprout className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">
                {PILLAR_MASCOT[pillar].name} ·{' '}
                {item.swapped ? 'Just for today: ' : 'From your habit: '}
                {item.habit}
              </span>
            </span>
          ) : (
            <span className={`text-xs font-bold ${accent.text}`}>
              {PILLAR_MASCOT[pillar].name} · {PILLAR_META[pillar].label}
            </span>
          )}
          <h2
            className="mt-1 text-2xl leading-tight font-bold text-ink"
            data-testid={`win-title-${pillar}`}
          >
            {item.title}
          </h2>
        </div>
        {item.why_this && (
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            aria-expanded={whyOpen}
            aria-controls={`roadmap-why-${pillar}`}
            className="min-h-11 shrink-0 self-start px-1 text-sm font-bold text-primary underline underline-offset-4"
            data-testid={`roadmap-why-toggle-${pillar}`}
          >
            Why?
          </button>
        )}
      </div>
      {item.why_this && (
        <p
          id={`roadmap-why-${pillar}`}
          hidden={!whyOpen}
          className="mt-3.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-sm leading-relaxed text-ink-soft"
          data-testid={`win-why-${pillar}`}
        >
          {item.why_this}
        </p>
      )}

      <ol className="mt-6" data-testid={`roadmap-steps-${pillar}`}>
        {steps.map((text, i) => {
          const isGoal = i === total - 1;
          const state = i < done ? 'done' : i === done && !stopped ? 'now' : 'next';
          const bonus = i >= floor && state !== 'done';
          return (
            <li key={`${i}-${text}`} className="contents">
              <div
                className="relative flex gap-3.5 pb-4"
                data-testid={`roadmap-step-${pillar}-${i}`}
                data-state={state}
              >
                {!isGoal && (
                  <span
                    className={`absolute top-9 bottom-0 left-[15px] w-[3px] rounded-full ${
                      state === 'done' ? `${accent.strong} opacity-45` : 'bg-line'
                    }`}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`relative z-10 flex h-[33px] w-[33px] shrink-0 items-center justify-center text-[13px] font-extrabold ${
                    isGoal ? 'rounded-[10px]' : 'rounded-full'
                  } ${
                    state === 'done'
                      ? `${accent.strong} text-surface`
                      : state === 'now'
                        ? `border-[3px] ${accent.border} ${accent.soft} ${accent.text}`
                        : 'border-[2.5px] border-dashed border-line-strong bg-surface text-ink-faint'
                  }`}
                  aria-hidden="true"
                >
                  {state === 'done' ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : isGoal ? (
                    <Flag className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </span>

                {state === 'now' ? (
                  <div
                    className={`min-w-0 flex-1 rounded-[22px] border-[1.5px] p-4 ${accent.border} ${accent.soft}`}
                  >
                    <p className={`text-xs font-bold ${accent.text}`}>
                      Right now · Step {i + 1} of {total}
                    </p>
                    <p
                      className="mt-1.5 mb-3.5 font-serif text-xl leading-snug font-bold text-ink"
                      data-testid={`roadmap-current-${pillar}`}
                    >
                      {text}
                    </p>
                    <button
                      type="button"
                      onClick={() => void advance()}
                      disabled={busy}
                      className={`k-press min-h-13 w-full rounded-full text-base font-extrabold text-surface disabled:opacity-60 ${accent.strong}`}
                      data-testid={`roadmap-done-${pillar}`}
                    >
                      {busy ? 'Saving...' : 'Done'}
                    </button>
                    {total < MAX_ROADMAP_STEPS && (
                      <button
                        type="button"
                        onClick={() => void smaller()}
                        disabled={busy}
                        className="mx-auto mt-2 flex min-h-11 items-center px-2 text-sm font-bold text-ink-soft underline underline-offset-4 disabled:opacity-60"
                        data-testid={`roadmap-smaller-${pillar}`}
                      >
                        Too big? Make it smaller
                      </button>
                    )}
                    {showTimer && (
                      <div className="mt-2">
                        <CountdownTimer
                          durationSeconds={item.duration_seconds ?? 0}
                          title={pillar === 'physical' ? 'Move timer' : 'Me-time timer'}
                          testIdPrefix={`win-timer-${pillar}`}
                          persistKey={userId ? timerKey(userId, logDate, pillar) : undefined}
                          compact
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <span
                    className={`min-w-0 flex-1 pt-1.5 text-[15px] ${
                      state === 'done'
                        ? 'text-ink-soft line-through decoration-ink/25'
                        : isGoal
                          ? 'font-bold text-ink-faint'
                          : 'text-ink-faint'
                    }`}
                  >
                    {text}
                    {bonus && (
                      <span className="ml-2 rounded-full border border-line px-2 py-px text-[11px] font-bold text-ink-faint no-underline">
                        Bonus
                      </span>
                    )}
                  </span>
                )}
              </div>

              {i === floor - 1 && !isGoal && (
                <div
                  className={`mb-4 flex items-center gap-2.5 text-xs font-extrabold ${accent.text}`}
                  data-testid={`roadmap-floor-${pillar}`}
                  data-reached={winIn}
                >
                  <span
                    className="h-0.5 flex-1 border-t-2 border-dashed border-current opacity-60"
                    aria-hidden="true"
                  />
                  <span
                    className={winIn ? `rounded-full px-3 py-1 text-surface ${accent.strong}` : ''}
                  >
                    {winIn ? "✓ Today's win is in" : "Today's win counts from here"}
                  </span>
                  <span
                    className="h-0.5 flex-1 border-t-2 border-dashed border-current opacity-60"
                    aria-hidden="true"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="mt-2 text-sm font-semibold text-peach-strong" role="alert">
          {error}
        </p>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-line pt-4">
        {stopped ? (
          <button
            type="button"
            onClick={() => {
              setStopped(false);
              setNote(null);
            }}
            className="min-h-11 text-sm font-bold text-ink-soft underline underline-offset-4"
            data-testid={`roadmap-resume-${pillar}`}
          >
            Pick it back up
          </button>
        ) : allDone ? (
          <span className="text-sm font-bold text-ink-soft">All done for today</span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setStopped(true);
              setNote('stopped');
            }}
            className="min-h-11 text-sm font-bold text-ink-soft underline underline-offset-4"
            data-testid={`roadmap-stop-${pillar}`}
          >
            Stop for today
          </button>
        )}
        <span className="flex items-center gap-3 text-sm text-ink-faint">
          {done > 0 && (
            <button
              type="button"
              onClick={() => void undo()}
              disabled={busy}
              className="min-h-11 px-1 font-semibold underline underline-offset-4 disabled:opacity-60"
              data-testid={`roadmap-undo-${pillar}`}
            >
              Undo last step
            </button>
          )}
          <span data-testid={`roadmap-count-${pillar}`}>
            {allDone ? `${total} of ${total}` : `Step ${done + 1} of ${total}`}
          </span>
        </span>
      </div>

      {note && (
        <div aria-live="polite" className="mt-4">
          <MascotBubble
            size="sm"
            pillar={pillar}
            mood={note === 'stopped' && !winIn ? 'calm' : 'cheer'}
            testId={`roadmap-note-${pillar}`}
            title={noteTitle(note, done, winIn)}
          >
            <p>{noteText(note, done, winIn, PILLAR_MASCOT[pillar].name)}</p>
          </MascotBubble>
        </div>
      )}

      {!item.completed && (
        <div className="mt-5 space-y-1 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isRecalibrating || busy}
              onClick={() => onRecalibrate(pillar)}
              data-testid={`recalibrate-${pillar}`}
            >
              {isRecalibrating ? (
                <>
                  <RefreshCw className="k-spin-slow h-4 w-4" aria-hidden="true" />
                  Re-calibrating...
                </>
              ) : (
                'Make the whole win lighter'
              )}
            </Button>
            <span className="k-chip" data-testid={`win-level-${pillar}`}>
              Level {item.level}
            </span>
          </div>
          <SwapToday pillar={pillar} onSwap={onSwap} busy={isSwapping || isRecalibrating || busy} />
        </div>
      )}
    </section>
  );
}

function noteTitle(note: Exclude<Note, null>, done: number, winIn: boolean): string {
  if (note === 'all') return 'Full session!';
  if (note === 'floor') return "Today's win is in.";
  if (winIn) return 'Win kept.';
  return done > 0 ? `You got to step ${done} today.` : 'Okay, not today.';
}

function noteText(note: Exclude<Note, null>, done: number, winIn: boolean, name: string): string {
  if (note === 'all') return `You went all the way today. ${name} is very proud.`;
  if (note === 'floor')
    return 'You showed up, and that is what counts. Anything from here is a bonus.';
  if (winIn) return `You stopped after step ${done} and today's win is already in. Rest well.`;
  if (done > 0) {
    return "That still counts as showing up. It's saved as started in your history, with no streak to lose. Come back to it later if you like.";
  }
  return 'Nothing is lost. Your steps will be right here if you want to come back later.';
}
