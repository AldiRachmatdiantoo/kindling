import { Check, ChevronDown, Feather, Lightbulb, RefreshCw } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import type { Pillar, WinItem, WorkWinItem } from '../../api/types';
import { CountdownTimer } from '../../components/CountdownTimer';
import { FeatureTip } from '../../components/FeatureTip';
import { Mascot, PILLAR_MASCOT } from '../../components/Mascot';
import { Button } from '@/components/watermelon-ui/button';
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
  workSlicer?: ReactNode;
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
  workSlicer,
}: WinCardProps) {
  const meta = PILLAR_META[pillar];
  const isMaxGentle = item.level >= 3;

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

      {/* Kept mounted while folded so a running timer keeps its place. */}
      <div
        id={`win-details-${pillar}`}
        hidden={!isOpen}
        className="space-y-4"
        data-testid={`win-details-${pillar}`}
      >
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
          <Check
            key={item.completed ? 'done' : 'open'}
            className={`h-4 w-4 ${justCompleted && item.completed ? 'k-pop' : ''}`}
            aria-hidden="true"
          />
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
      </div>
    </article>
  );
});
