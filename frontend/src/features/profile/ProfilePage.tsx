import { Award, Flame, HeartHandshake, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { profileApi } from '../../api/endpoints';
import type { HeatmapData } from '../../api/types';
import { FeatureTip } from '../../components/FeatureTip';
import { HeatmapGrid } from '../../components/HeatmapGrid';
import { Mascot } from '../../components/Mascot';
import { useAuth } from '../auth/AuthContext';
import { useWelcomeTour } from '../onboarding/WelcomeTour';
import { PageLoading } from '../../components/PageLoading';
import { PatternDiscovery } from './PatternDiscovery';
import { DayDetail, RecentDays } from './DayHistory';
import { Button } from '@/components/watermelon-ui/button';
import { Card } from '@/components/ui/card';

export function ProfilePage() {
  const { user } = useAuth();
  const { openTour } = useWelcomeTour();
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    profileApi
      .getHeatmap()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "We couldn't load your heatmap.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  if (loading) {
    return <PageLoading testId="profile-loading" />;
  }

  if (error || !data) {
    return (
      <div
        className="k-error mx-auto max-w-md p-6 text-center"
        data-testid="profile-error"
        role="alert"
      >
        <p>{error || "Your profile isn't available right now."}</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setError(null);
            setLoading(true);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const statCards = [
    {
      key: 'total_active_days',
      label: 'Active days',
      value: data.milestones.total_active_days,
      icon: Flame,
      tint: 'text-ink',
    },
    {
      key: 'total_complete_days',
      label: '3/3 days',
      value: data.milestones.total_complete_days,
      icon: Award,
      tint: 'text-mint-strong',
    },
    {
      key: 'total_recovery_days',
      label: 'Recovery days',
      value: data.milestones.total_recovery_days,
      icon: HeartHandshake,
      tint: 'text-sky-strong',
    },
    {
      key: 'total_daily_wins',
      label: 'Daily wins',
      value: data.milestones.total_daily_wins,
      icon: Trophy,
      tint: 'text-sun-strong',
    },
  ];

  const initials =
    (user?.full_name || 'Kindling')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'K';

  return (
    <div className="space-y-6">
      <Card asChild className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <section>
          <div className="flex items-center gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary bg-primary-soft font-serif text-xl font-bold text-ink"
              aria-hidden="true"
            >
              {initials}
            </span>
            <div>
              <p className="text-xs font-semibold text-ink-faint">Profile and recovery trail</p>
              <h1 className="text-3xl font-bold tracking-tight text-ink">
                {user?.full_name || 'Kindling friend'}
              </h1>
              <p className="text-sm text-ink-soft">
                {user?.email} · {user?.timezone || 'Asia/Jakarta'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1.5 pr-4 pl-2 text-xs leading-relaxed font-medium text-ink">
            <Mascot mood="calm" className="h-12 w-10 shrink-0" />
            No streaks to break. Rest is part of the process.
          </div>
          <Button onClick={openTour} variant="secondary" data-testid="replay-tour">
            Replay the tour
          </Button>
        </section>
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ key, label, value, icon: Icon, tint }) => (
          <div
            key={key}
            className="rounded-3xl border border-line bg-surface p-5"
            data-testid={`stat-${key}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink-soft">{label}</span>
              <Icon className={`h-4 w-4 shrink-0 ${tint}`} aria-hidden="true" />
            </div>
            <p className={`mt-2 k-tinted-num font-serif text-4xl font-bold tracking-tight ${tint}`}>{value}</p>
            <p className="mt-1 text-[11px] text-ink-soft">All time</p>
          </div>
        ))}
      </section>

      <PatternDiscovery />

      <Card asChild className="space-y-4 p-6">
        <section>
          <div>
            <h2 className="text-2xl font-bold text-ink">Your last 365 days</h2>
            <p className="mt-1 text-xs text-ink-soft">
              From {data.range.from} to {data.range.to}. An empty dot is a rest day, never a
              failure.
            </p>
          </div>

          <FeatureTip id="profile-heatmap" title="How to read your heatmap" mood="calm">
            <p>
              Each dot is one day. Blue means you took a recovery moment, light green means 1 or 2
              wins, and full green means all 3. Grey dots are rest days, and rest is never a
              failure. Tap any dot to see what happened that day.
            </p>
          </FeatureTip>

          <HeatmapGrid
            from={data.range.from}
            to={data.range.to}
            days={data.days}
            onOpenDay={setOpenDate}
          />
        </section>
      </Card>

      {openDate && <DayDetail key={openDate} date={openDate} onClose={() => setOpenDate(null)} />}

      <RecentDays days={data.days} activeDate={openDate} onOpen={setOpenDate} />
    </div>
  );
}
