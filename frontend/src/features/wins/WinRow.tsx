import { Check, ChevronRight } from 'lucide-react';
import type { Pillar, WinItem, WorkWinItem } from '../../api/types';
import { PILLAR_META } from './constants';
import { isRoadmap, roadmapState } from './RoadmapPanel';

// The selected row takes its pillar's color as a ring, so the link to the panel is visible.
const SELECTED: Record<Pillar, string> = {
  physical: 'border-mint-strong ring-3 ring-mint-strong/15',
  work: 'border-sun-strong ring-3 ring-sun-strong/15',
  soul: 'border-sky-strong ring-3 ring-sky-strong/15',
};

/** One short line for the win list: where this win stands today. */
export function winState(pillar: Pillar, item: WinItem | WorkWinItem): string {
  if (pillar !== 'work' && isRoadmap(item)) return roadmapState(item);
  if (item.completed) return 'Done';
  if (pillar === 'work' && (item as WorkWinItem).micro_step) {
    return `Tiny step ${((item as WorkWinItem).steps_done ?? 0) + 1} in progress`;
  }
  return 'Not started';
}

export interface WinRowProps {
  pillar: Pillar;
  item: WinItem | WorkWinItem;
  selected: boolean;
  /** The first win still to do: tagged "Next up" so the list has an obvious start. */
  next?: boolean;
  onSelect: (pillar: Pillar) => void;
}

/**
 * A win in the to-do list: a check circle, pillar, title and one line of state. Everything
 * else lives in the detail panel, so the list stays readable at a glance.
 */
export function WinRow({ pillar, item, selected, next = false, onSelect }: WinRowProps) {
  const meta = PILLAR_META[pillar];
  const state = winState(pillar, item);
  const notStarted = state === 'Not started';
  return (
    <button
      type="button"
      onClick={() => onSelect(pillar)}
      aria-current={selected ? 'true' : undefined}
      className={`k-press flex w-full items-center gap-3.5 rounded-3xl border-[1.5px] bg-surface px-4 py-3.5 text-left transition-colors sm:px-5 ${
        selected
          ? SELECTED[pillar]
          : item.completed
            ? 'border-mint-strong/50'
            : 'border-line hover:border-line-strong'
      }`}
      data-testid={`win-row-${pillar}`}
    >
      {/* The check circle carries the to-do reading: empty until the win is in. */}
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          item.completed ? 'bg-mint-strong text-surface' : 'border-2 border-line-strong bg-surface'
        }`}
        data-testid={`win-check-${pillar}`}
        data-checked={item.completed}
        aria-hidden="true"
      >
        {item.completed && <Check className="h-5 w-5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-bold ${meta.text}`}>{meta.label}</span>
          {next && (
            <span
              className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-surface"
              data-testid={`win-next-${pillar}`}
            >
              Next up
            </span>
          )}
        </span>
        <span
          className={`mt-0.5 block font-serif text-lg leading-snug font-bold ${
            item.completed ? 'text-ink-soft line-through decoration-2' : 'text-ink'
          }`}
        >
          {item.title}
        </span>
        <span
          className="mt-1 block text-[13px] text-ink-soft"
          data-testid={`win-row-state-${pillar}`}
        >
          {state}
        </span>
      </span>
      {item.completed ? (
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" aria-hidden="true" />
      ) : notStarted ? (
        <span className="shrink-0 rounded-full border-[1.5px] border-line-strong px-4 py-2 text-[13px] font-bold text-ink">
          Start
        </span>
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" aria-hidden="true" />
      )}
    </button>
  );
}
