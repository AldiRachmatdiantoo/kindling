import { CalendarDays, HeartHandshake, Search, TrendingDown, TrendingUp, Wind } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { ApiError } from '../../api/client';
import { profileApi } from '../../api/endpoints';
import type { Insight, InsightsData } from '../../api/types';
import { Mascot } from '../../components/Mascot';
import { Button } from '@/components/watermelon-ui/button';
import { Card } from '@/components/ui/card';

const KIND_ICON: Record<string, ComponentType<{ className?: string }>> = {
  weekday_peak: CalendarDays,
  cope_next_day: HeartHandshake,
  recovery_days: Wind,
};

function iconFor(insight: Insight) {
  if (insight.kind === 'exhaustion_trend') {
    return insight.id === 'trend-rising' ? TrendingUp : TrendingDown;
  }
  return KIND_ICON[insight.kind] ?? Search;
}

/**
 * Patterns found in the user's own recent check-ins. Every line quotes its sample size, and
 * nothing appears until there is at least a week of data, so it never invents a story.
 */
export function PatternDiscovery() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    profileApi
      .getInsights()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Patterns aren't loading right now.");
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <Card asChild className="space-y-4 p-6">
      <section data-testid="pattern-discovery" aria-busy={!data && !error}>
        <div className="flex items-start gap-3">
          <Mascot mood="happy" className="h-16 w-14 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-ink-soft">Pattern Discovery</p>
            <h2 className="text-2xl font-bold text-ink">What your check-ins are telling you</h2>
            {data && data.days_analyzed > 0 && (
              <p className="mt-1 text-xs text-ink-soft">
                Found in your last {data.days_analyzed} check-ins.
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink" role="alert">
            <span>{error}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {!data && !error && (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-16 rounded-2xl bg-surface-2" />
            <div className="h-16 rounded-2xl bg-surface/40" />
          </div>
        )}

        {data && data.days_analyzed < data.min_days && (
          <p
            className="rounded-2xl bg-surface-2 p-4 text-sm text-ink"
            data-testid="pattern-waiting"
          >
            Ember starts spotting patterns after a week of check-ins. You're{' '}
            {data.min_days - data.days_analyzed}{' '}
            {data.min_days - data.days_analyzed === 1 ? 'day' : 'days'} away. There's nothing to
            keep up with, just check in when you can.
          </p>
        )}

        {data && data.days_analyzed >= data.min_days && data.insights.length === 0 && (
          <p className="rounded-2xl bg-surface-2 p-4 text-sm text-ink" data-testid="pattern-none">
            No clear pattern yet, and that's fine. Ember only mentions something when your own data
            clearly shows it.
          </p>
        )}

        {data && data.insights.length > 0 && (
          <ul className="space-y-3">
            {data.insights.map((insight) => {
              const Icon = iconFor(insight);
              return (
                <li
                  key={insight.id}
                  className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4"
                  data-testid={`insight-${insight.id}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-serif text-lg leading-snug font-bold text-ink">
                      {insight.headline}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">{insight.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {data && data.insights.length > 0 && (
          <p className="text-[11px] text-ink-soft">
            These are patterns in your own check-ins, not rules or medical advice. They get sharper
            the more days you log.
          </p>
        )}
      </section>
    </Card>
  );
}
