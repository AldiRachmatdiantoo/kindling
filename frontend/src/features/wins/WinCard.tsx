import { Check, ChevronDown, Feather, Lightbulb, RefreshCw, Shuffle, Sprout } from 'lucide-react';
import { memo, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { Pillar, WinItem, WorkWinItem } from '../../api/types';
import { CountdownTimer } from '../../components/CountdownTimer';
import { FeatureTip } from '../../components/FeatureTip';
import { Mascot, PILLAR_MASCOT } from '../../components/Mascot';
import { QuickPicks } from '../../components/QuickPicks';
import { Button } from '@/components/watermelon-ui/button';
import { Input } from '@/components/ui/input';
import { PILLAR_META, timerKey } from './constants';

export interface WinCardProps {
  pillar: Pillar;
  item: WinItem | WorkWinItem;
  logDate: string;
  userId: string | undefined;
  isOpen: boolean;
  isToggling: boolean;
  isRecalibrating: boolean;
  justCompleted: boolean;
  shrunk: boolean;
  showShrunkTip: boolean;
  previousTitle?: string;
  onToggleDetails: (pillar: Pillar) => void;
  onToggle: (pillar: Pillar) => void;
  onRecalibrate: (pillar: Pillar) => void;
  /** Trade the win for another activity today; resolves with an error message, or null. */
  onSwap?: (pillar: Pillar, activity: string) => Promise<string | null>;
  isSwapping?: boolean;
  workSlicer?: ReactNode;
}

// Tap-to-fill ideas for the swap input; work has the Task Slicer instead of a swap.
export const SWAP_PICKS: Partial<Record<Pillar, readonly string[]>> = {
  physical: [
    'Yoga in my room',
    'A short walk',
    'Light stretching',
    'Dancing to one song',
    'Taking the stairs',
  ],
  soul: [
    'Call a friend',
    'Listen to music',
    'Read a few pages',
    'Sit outside for a bit',
    'Write a few lines',
  ],
};

/**
 * "Do something else today": the user names another activity and the win is rebuilt from it,
 * for today only. The standing habit is untouched and returns tomorrow.
 */
export function SwapToday({
  pillar,
  onSwap,
  busy,
}: {
  pillar: Pillar;
  onSwap: (pillar: Pillar, activity: string) => Promise<string | null>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = activity.trim();
    if (!clean) {
      setError('Tell me what you would rather do today.');
      return;
    }
    setError(null);
    const err = await onSwap(pillar, clean);
    if (err) setError(err);
    else {
      setOpen(false);
      setActivity('');
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        data-testid={`swap-open-${pillar}`}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-60"
      >
        <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
        Do something else today
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-2xl border border-line bg-surface-2 p-3"
      data-testid={`swap-form-${pillar}`}
      noValidate
    >
      <label htmlFor={inputId} className="block text-xs font-semibold text-ink">
        What would you rather do today?
        <span className="block font-normal text-ink-soft">Your habit comes back tomorrow.</span>
      </label>
      <Input
        id={inputId}
        value={activity}
        maxLength={120}
        autoFocus
        onChange={(e) => setActivity(e.target.value)}
        placeholder={pillar === 'physical' ? 'e.g. yoga in my room' : 'e.g. call a friend'}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        data-testid={`swap-input-${pillar}`}
      />
      {SWAP_PICKS[pillar] && (
        <QuickPicks
          options={SWAP_PICKS[pillar]}
          targetId={inputId}
          value={activity}
          onPick={(option) => {
            setActivity(option);
            setError(null);
          }}
          label={`Quick picks for today's ${pillar} win`}
          disabled={busy}
          testIdPrefix={`swap-pick-${pillar}`}
        />
      )}
      {error && (
        <p id={`${inputId}-error`} className="text-xs font-semibold text-peach-strong" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={busy}
          data-testid={`swap-submit-${pillar}`}
          className="flex-1"
        >
          {busy ? 'Swapping...' : 'Swap it'}
        </Button>
      </div>
    </form>
  );
}

export const WinCard = memo(function WinCard({
  pillar,
  item,
  logDate,
  userId,
  isOpen,
  isToggling,
  isRecalibrating,
  justCompleted,
  shrunk,
  showShrunkTip,
  previousTitle,
  onToggleDetails,
  onToggle,
  onRecalibrate,
  onSwap,
  isSwapping = false,
  workSlicer,
}: WinCardProps) {
  const meta = PILLAR_META[pillar];
  const isMaxGentle = item.level >= 3;

  // The details stay in the DOM (hidden) while folded, so a running timer keeps its place.
  // `shown` lags isOpen on the way out so the fold can animate before `hidden` applies.
  const [shown, setShown] = useState(isOpen);
  if (isOpen && !shown) setShown(true);
  useEffect(() => {
    if (isOpen || !shown) return;
    const t = window.setTimeout(() => setShown(false), 450); // backstop if no animation runs
    return () => window.clearTimeout(t);
  }, [isOpen, shown]);

  return (
    <article
      data-testid={`win-card-${pillar}`}
      className={`relative flex flex-col gap-3 overflow-hidden rounded-3xl border p-4 transition-colors duration-300 sm:gap-4 sm:p-5 ${
        item.completed ? 'border-mint-strong bg-mint' : 'border-line bg-surface'
      } ${isRecalibrating ? 'k-recal' : ''}`}
      aria-busy={isRecalibrating || undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Mascot
            pillar={pillar}
            mood={item.completed ? 'cheer' : 'happy'}
            className={`h-11 w-10 shrink-0 sm:h-14 sm:w-12 ${justCompleted && item.completed ? 'k-pop' : ''}`}
          />
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${meta.text}`}>
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden="true" />
            {PILLAR_MASCOT[pillar].name} · {meta.label}
          </span>
        </span>
        <span className="k-chip" data-testid={`win-level-${pillar}`}>
          Level {item.level}
        </span>
      </div>

      <div
        key={item.level}
        className={shrunk ? 'k-shrink-in' : undefined}
        data-testid={`win-goal-${pillar}`}
      >
        <h2
          className={`text-lg leading-snug font-bold sm:text-xl ${
            item.completed ? 'text-ink-soft line-through' : 'text-ink'
          }`}
          data-testid={`win-title-${pillar}`}
        >
          {item.title}
        </h2>
        {previousTitle && item.level > 0 && (
          <p className="mt-1 text-xs text-ink-soft" data-testid={`win-previous-${pillar}`}>
            <span className="sr-only">Was: </span>
            <s>{previousTitle}</s>
          </p>
        )}
        <p className="mt-1 text-xs text-ink-soft">{meta.subtitle}</p>
        {item.habit && (
          <span
            className="mt-2.5 mr-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink"
            data-testid={`win-habit-${pillar}`}
          >
            {item.swapped ? (
              <Shuffle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Sprout className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              {item.swapped ? 'Just for today: ' : 'From your habit: '}
              {item.habit}
            </span>
          </span>
        )}
        {item.level > 0 && (
          <span
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink"
            data-testid={`win-recal-${pillar}`}
          >
            <Feather className="h-3.5 w-3.5" aria-hidden="true" />
            Made lighter {item.level}x · No penalty
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onToggleDetails(pillar)}
        aria-expanded={isOpen}
        aria-controls={`win-details-${pillar}`}
        data-testid={`win-details-toggle-${pillar}`}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3.5 py-2 text-left text-sm font-bold text-ink hover:brightness-110"
      >
        <span>
          {isOpen
            ? 'Hide details'
            : pillar === 'work'
              ? 'How to start · Task slicer'
              : item.duration_seconds && !item.completed
                ? 'How to start · Timer'
                : 'How to start'}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Watermelon-style disclosure: the panel springs open to its height and folds away. */}
      <m.div
        id={`win-details-${pillar}`}
        hidden={!shown}
        initial={false}
        animate={isOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30, opacity: { duration: 0.2 } }}
        onAnimationComplete={() => {
          if (!isOpen) setShown(false);
        }}
        className="-mx-1 overflow-hidden px-1"
        data-testid={`win-details-${pillar}`}
      >
        <div className="space-y-4 pb-1">
          {item.why_this && (
            <div className="rounded-2xl bg-surface-2 px-3.5 py-3" data-testid={`win-why-${pillar}`}>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
                <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                Why this, today
              </span>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{item.why_this}</p>
            </div>
          )}

          {item.steps && item.steps.length > 0 && (
            <div data-testid={`win-steps-${pillar}`}>
              <span className="text-[11px] font-bold text-ink">How to start</span>
              <ol className="mt-1.5 space-y-1.5">
                {item.steps.map((stepText, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-snug text-ink">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-[11px] font-bold"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span>{stepText}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {pillar !== 'work' && !item.completed && item.duration_seconds ? (
            <CountdownTimer
              durationSeconds={item.duration_seconds}
              title={pillar === 'physical' ? 'Move timer' : 'Me-time timer'}
              testIdPrefix={`win-timer-${pillar}`}
              persistKey={userId ? timerKey(userId, logDate, pillar) : undefined}
              compact
            />
          ) : null}

          {workSlicer}
        </div>
      </m.div>

      <div className="mt-auto space-y-2 pt-1">
        <button
          type="button"
          disabled={isToggling}
          onClick={() => onToggle(pillar)}
          data-testid={`win-toggle-${pillar}`}
          aria-pressed={item.completed}
          className={`k-press flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold disabled:opacity-60 ${
            item.completed
              ? 'border-transparent bg-mint-strong text-surface'
              : 'border-line-strong bg-transparent text-ink hover:bg-surface-2'
          }`}
        >
          {/* Watermelon "Save Toggle" feel: the check springs in when the win lands. */}
          <AnimatePresence initial={false} mode="popLayout">
            <m.span
              key={item.completed ? 'done' : 'open'}
              initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              className="flex"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
            </m.span>
          </AnimatePresence>
          {isToggling ? 'Saving...' : item.completed ? 'Done (undo)' : 'Mark as done'}
        </button>

        {isMaxGentle ? (
          <div
            className="flex items-start gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink"
            data-testid={`rest-message-${pillar}`}
          >
            <Feather className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Resting is a valid choice too. It's okay to stop here for today.</span>
          </div>
        ) : !item.completed ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isRecalibrating}
            onClick={() => onRecalibrate(pillar)}
            data-testid={`recalibrate-${pillar}`}
            className="w-full"
          >
            {isRecalibrating ? (
              <>
                <RefreshCw className="k-spin-slow h-4 w-4" aria-hidden="true" />
                Re-calibrating...
              </>
            ) : (
              'Still too heavy'
            )}
          </Button>
        ) : null}

        {onSwap && !item.completed && (
          <SwapToday pillar={pillar} onSwap={onSwap} busy={isSwapping || isRecalibrating} />
        )}
      </div>
      {/* Below the actions, so its bubble never covers Mark as done. */}
      {showShrunkTip && (
        <FeatureTip
          autoOpen
          id="wins-shrunk"
          title="Done, it's smaller now"
          pillar={pillar}
          mood="calm"
        >
          <p>
            Still too much? Tap it again. Each tap makes the goal lighter, and at the lightest
            level, resting counts as the win.
          </p>
        </FeatureTip>
      )}
    </article>
  );
});
