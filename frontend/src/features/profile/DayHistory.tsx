import { CalendarDays, Check, Feather, HeartHandshake, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import type { DailyLog, HeatmapDay, Pillar } from '../../api/types';
import { HEATMAP_DOT, HEATMAP_LABELS } from '../../components/HeatmapGrid';
import { Mascot, PILLAR_MASCOT } from '../../components/Mascot';
import { MascotBubble } from '../../components/MascotBubble';
import { TIER_META, TIER_MOOD } from '../today/tier';
import { formatLongDate } from '../../utils/date';
import { Button } from '@/components/watermelon-ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export { formatLongDate };

const PILLARS: Pillar[] = ['physical', 'work', 'soul'];

const PILLAR_LABEL: Record<Pillar, string> = {
  physical: 'Physical',
  work: 'Work',
  soul: 'Soul',
};

const SCORE_ROWS = [
  { key: 'physical_exhaustion', label: 'Physical exhaustion', bar: 'bg-peach-strong' },
  { key: 'work_exhaustion', label: 'Work exhaustion', bar: 'bg-sun-strong' },
  { key: 'disengagement', label: 'Disengagement', bar: 'bg-sky-strong' },
  { key: 'soul_wellbeing', label: 'Soul well-being', bar: 'bg-mint-strong' },
] as const;

function formatShortDate(date: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  } catch {
    return date;
  }
}

/** The last few days that have something logged, newest first. */
export function recentActiveDays(days: HeatmapDay[], limit = 7): HeatmapDay[] {
  return days
    .filter((d) => d.level !== 'rest')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export interface RecentDaysProps {
  days: HeatmapDay[];
  activeDate: string | null;
  onOpen: (date: string) => void;
}

/** A tappable list of recent days, so history is reachable without hunting for tiny dots. */
export function RecentDays({ days, activeDate, onOpen }: RecentDaysProps) {
  const recent = recentActiveDays(days);

  return (
    <Card asChild className="space-y-4 p-6">
      <section data-testid="recent-days">
        <div>
          <h2 className="text-2xl font-bold text-ink">Recent days</h2>
          <p className="mt-1 text-xs text-ink-soft">Tap a day to see how it went.</p>
        </div>

        {recent.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4 text-sm text-ink-soft">
            <Mascot mood="calm" className="h-12 w-10 shrink-0" />
            Your check-ins will show up here, one card per day.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((day) => (
              <li key={day.date}>
                <button
                  type="button"
                  onClick={() => onOpen(day.date)}
                  aria-pressed={activeDate === day.date}
                  data-testid={`recent-day-${day.date}`}
                  className="k-press flex min-h-11 w-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-left hover:bg-primary-soft"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-serif text-base font-bold text-ink">
                      {formatShortDate(day.date)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${HEATMAP_DOT[day.level]}`}
                        aria-hidden="true"
                      />
                      {HEATMAP_LABELS[day.level]}
                    </span>
                  </span>
                  <span className="text-xs text-ink-soft">
                    {day.wins_count}/3 wins
                    {day.cope_chosen ? ` · ${day.cope_chosen}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}

export interface DayDetailProps {
  date: string;
  onClose: () => void;
}

type DetailState =
  | { kind: 'loading' }
  | { kind: 'rest' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; log: DailyLog };

/** Everything from one past day: the energy map, what Ember noticed, the cope and the 3 wins. */
export function DayDetail({ date, onClose }: DayDetailProps) {
  const [state, setState] = useState<DetailState>({ kind: 'loading' });
  const panelRef = useRef<HTMLElement>(null);
  // Whatever opened the panel (a dot or a recent-day card) gets focus back on close.
  const openerRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);

  const close = () => {
    onClose();
    openerRef.current?.focus?.();
  };

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    checkinApi
      .getByDate(date)
      .then((log) => {
        if (active) setState({ kind: 'ready', log });
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: 'rest' });
          return;
        }
        setState({
          kind: 'error',
          message: err instanceof ApiError ? err.message : "We couldn't load that day.",
        });
      });
    return () => {
      active = false;
    };
  }, [date]);

  // Bring the panel into view and move focus to it, so keyboard and screen reader users land here.
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    panelRef.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    panelRef.current?.focus({ preventScroll: true });
  }, [date]);

  return (
    <Card asChild className="k-enter scroll-mt-28 space-y-5 p-6 focus:outline-none">
      <section
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby="day-detail-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
        data-testid="day-detail"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-faint">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Day details
            </p>
            <h2 id="day-detail-title" className="text-2xl font-bold text-ink">
              {formatLongDate(date)}
            </h2>
          </div>
          <Button
            variant="secondary"
            size="icon"
            onClick={close}
            aria-label="Close day details"
            data-testid="day-detail-close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {state.kind === 'loading' && (
          <div className="flex items-center gap-3 text-sm text-ink-soft" role="status">
            <div className="k-spinner h-6 w-6" />
            Opening that day...
          </div>
        )}

        {state.kind === 'error' && <div className="k-error">{state.message}</div>}

        {state.kind === 'rest' && (
          <MascotBubble mood="sleepy" title="A rest day" size="sm" testId="day-detail-rest">
            <p>Nothing was logged on this day, and that's completely okay. Resting counts too.</p>
          </MascotBubble>
        )}

        {state.kind === 'ready' && <DayLog log={state.log} />}
      </section>
    </Card>
  );
}

function DayLog({ log }: { log: DailyLog }) {
  const tier = TIER_META[log.calibration_tier];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`k-chip ${tier.badgeClass}`} data-testid="day-detail-tier">
          {tier.label}
        </span>
        <Badge data-testid="day-detail-wins-count">{log.wins_completed_count}/3 wins</Badge>
      </div>

      <MascotBubble
        mood={TIER_MOOD[log.calibration_tier]}
        title="What I noticed that day"
        size="sm"
      >
        <p>{log.diagnostic_summary}</p>
      </MascotBubble>

      <div>
        <h3 className="text-base font-bold text-ink">Energy map</h3>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          {SCORE_ROWS.map(({ key, label, bar }) => (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <dt className="text-ink-soft">{label}</dt>
                <dd className="font-bold text-ink">{log.scores[key]}</dd>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${bar}`}
                  style={{ width: `${log.scores[key]}%` }}
                />
              </div>
            </div>
          ))}
        </dl>
      </div>

      <div
        className="flex items-start gap-3 rounded-2xl bg-sky/60 p-4"
        data-testid="day-detail-cope"
      >
        <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden="true" />
        <div className="text-sm">
          <p className="text-xs font-bold text-ink">Recovery moment</p>
          <p className="text-ink-soft">
            {log.positive_cope_chosen ?? 'No recovery moment picked that day.'}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-base font-bold text-ink">Daily wins</h3>
        <ul className="mt-2 space-y-2.5">
          {PILLARS.map((pillar) => {
            const win = log.wins_data[pillar];
            const microStep = pillar === 'work' ? log.wins_data.work.micro_step : null;
            return (
              <li
                key={pillar}
                className="flex items-start gap-3 rounded-2xl border border-line/15 p-3"
                data-testid={`day-detail-win-${pillar}`}
              >
                <Mascot
                  pillar={pillar}
                  mood={win.completed ? 'cheer' : 'calm'}
                  className="h-12 w-10 shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-ink-soft">
                      {PILLAR_MASCOT[pillar].name} · {PILLAR_LABEL[pillar]}
                    </span>
                    {win.completed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-mint-strong">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Done
                      </span>
                    ) : (win.floor_step ?? 0) > 0 && (win.steps_done ?? 0) > 0 ? (
                      // A roadmap stopped before its floor: showing up still counts, so it
                      // reads as started, never as a failure.
                      <span
                        className="rounded-full bg-sky px-2 py-0.5 text-[11px] font-semibold text-sky-strong"
                        data-testid={`day-detail-started-${pillar}`}
                      >
                        Started · {win.steps_done} of {win.steps?.length ?? 0} steps
                      </span>
                    ) : (
                      <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                        Not done
                      </span>
                    )}
                    {win.level > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-lavender px-2 py-0.5 text-[11px] font-semibold text-lavender-strong">
                        <Feather className="h-3 w-3" aria-hidden="true" />
                        Made lighter {win.level}x
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-ink">{win.title}</p>
                  {microStep && <p className="text-xs text-ink-soft">Tiny step: {microStep}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
