import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { HeatmapDay, HeatmapLevel } from '../api/types';
import { buildDateRange } from '../utils/date';

export interface HeatmapGridProps {
  from: string;
  to: string;
  days: HeatmapDay[];
  /** Opens the full history for a tapped day. */
  onOpenDay?: (date: string) => void;
}

const LEVEL_STYLES: Record<HeatmapLevel, string> = {
  rest: 'bg-ink/10 hover:ring-ink/40',
  recovery: 'bg-sky-strong hover:ring-ink',
  steady: 'bg-mint-strong/45 hover:ring-ink',
  complete: 'bg-mint-strong hover:ring-ink',
};

/** Fill color alone, for dots outside the grid (legend, recent days). */
export const HEATMAP_DOT: Record<HeatmapLevel, string> = {
  rest: 'bg-ink/10',
  recovery: 'bg-sky-strong',
  steady: 'bg-mint-strong/45',
  complete: 'bg-mint-strong',
};

export const HEATMAP_LABELS: Record<HeatmapLevel, string> = {
  rest: 'Rest',
  recovery: 'Recovery',
  steady: 'Steady (1–2)',
  complete: 'Complete (3)',
};

const LEVEL_LABELS: Record<HeatmapLevel, string> = {
  rest: 'Rest day',
  recovery: 'Recovery (Positive Cope)',
  steady: 'Steady steps (1–2 wins)',
  complete: '3/3 Daily Wins',
};

export function HeatmapGrid({ from, to, days, onOpenDay }: HeatmapGridProps) {
  // Today sits at the right end. On a narrow screen the grid scrolls, so open it there
  // rather than on a year-old week.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [to]);
  const [selectedDay, setSelectedDay] = useState<HeatmapDay | null>(null);

  const cells = useMemo<HeatmapDay[]>(() => {
    const map = new Map<string, HeatmapDay>();
    for (const day of days) {
      map.set(day.date, day);
    }

    return buildDateRange(from, to).map((date) => {
      const existing = map.get(date);
      if (existing) return existing;
      return {
        date,
        level: 'rest' as const,
        wins_count: 0,
        cope_chosen: null,
      };
    });
  }, [from, to, days]);

  // Group into columns of 7 days (GitHub-style vertical weeks)
  const weeks = useMemo(() => {
    const cols: HeatmapDay[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      cols.push(cells.slice(i, i + 7));
    }
    return cols;
  }, [cells]);

  return (
    <div className="space-y-4" data-testid="heatmap-grid">
      <div ref={scrollRef} className="overflow-x-auto pb-2">
        <div className="inline-flex gap-1" role="grid" aria-label="Your 365-day recovery heatmap">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="flex flex-col gap-1" role="row">
              {week.map((cell) => {
                const label = `${cell.date}: ${LEVEL_LABELS[cell.level]}${
                  cell.wins_count > 0 ? `, ${cell.wins_count} win` : ''
                }${cell.cope_chosen ? `, cope: ${cell.cope_chosen}` : ''}`;

                return (
                  <button
                    key={cell.date}
                    type="button"
                    role="gridcell"
                    aria-label={label}
                    title={label}
                    data-testid={`heatmap-cell-${cell.date}`}
                    data-level={cell.level}
                    onMouseEnter={() => setSelectedDay(cell)}
                    onFocus={() => setSelectedDay(cell)}
                    onClick={() => {
                      setSelectedDay(cell);
                      onOpenDay?.(cell.date);
                    }}
                    className={`h-3.5 w-3.5 rounded-full transition-all hover:ring-2 focus:outline-none focus:ring-2 focus:ring-primary ${LEVEL_STYLES[cell.level]}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t-[1.5px] border-ink/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-[20px] text-xs text-ink-soft" data-testid="heatmap-detail">
          {selectedDay ? (
            <span>
              <strong>{selectedDay.date}</strong> · {LEVEL_LABELS[selectedDay.level]}
              {selectedDay.wins_count > 0 ? ` · ${selectedDay.wins_count}/3 wins` : ''}
              {selectedDay.cope_chosen ? ` · Cope: ${selectedDay.cope_chosen}` : ''}
            </span>
          ) : (
            <span>Hover over any dot for a quick look, or tap it to open that day.</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-ink-soft">
          {(['rest', 'recovery', 'steady', 'complete'] as HeatmapLevel[]).map((lvl) => (
            <span key={lvl} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-full ${HEATMAP_DOT[lvl]}`} />
              {HEATMAP_LABELS[lvl]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
