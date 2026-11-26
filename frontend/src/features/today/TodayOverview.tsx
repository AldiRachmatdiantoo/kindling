import { Check, Circle, HeartHandshake, Leaf, Lock, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DailyLog, Pillar } from '../../api/types';
import { FeatureTip } from '../../components/FeatureTip';
import { Mascot } from '../../components/Mascot';
import { SafetyBanner } from '../../components/SafetyBanner';
import { moodGreeting, TIER_META, TIER_MOOD } from './tier';
import { Button } from '@/components/watermelon-ui/button';

const PILLAR_LABEL: Record<Pillar, string> = {
  physical: 'Physical',
  work: 'Work',
  soul: 'Soul',
};

function formatLongDate(logDate: string): string {
  try {
    // Noon UTC keeps the calendar day stable whatever the viewer's timezone.
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${logDate}T12:00:00Z`));
  } catch {
    return logDate;
  }
}

/**
 * "Today": what the Check-In tab shows once today's check-in is locked. One glance
 * at the day so far (energy mode, chosen recovery, wins progress) and the next step.
 */
export function TodayOverview({ log }: { log: DailyLog }) {
  const tier = TIER_META[log.calibration_tier];
  const pillars: Pillar[] = ['physical', 'work', 'soul'];
  const allDone = log.wins_completed_count >= 3;

  return (
    <div className="space-y-6" data-testid="checkin-done">
      {log.safety_flag && <SafetyBanner />}

      <section className="k-card space-y-4 p-6 sm:p-8" data-testid="today-summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-end gap-3">
            <Mascot
              mood={allDone ? 'cheer' : TIER_MOOD[log.calibration_tier]}
              className="k-pop h-20 w-16 shrink-0"
            />
            <div>
              <p className="text-xs font-semibold text-ink-faint">{formatLongDate(log.log_date)}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Today</h1>
            </div>
          </div>
          <span className={`k-chip ${tier.badgeClass}`} data-testid="today-tier">
            <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
            {tier.label}
          </span>
        </div>
        <p
          className="max-w-3xl font-serif text-lg leading-snug font-semibold text-ink sm:text-xl"
          data-testid="mood-greeting"
        >
          {moodGreeting(log.calibration_tier, log.scores)}
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-ink">{log.diagnostic_summary}</p>
        <p className="text-xs text-ink-soft">{tier.desc}</p>
      </section>

      <FeatureTip id="today-how" title="Your day at a glance">
        <p>
          Your mode, your recovery pick, and your wins all live here. Your check-in stays locked
          until tomorrow so your goals stay steady. Tap a button below to pick up where you left
          off.
        </p>
      </FeatureTip>

      <div className="grid gap-4 md:grid-cols-[2fr_3fr]">
        <section className="flex flex-col gap-3 rounded-3xl border-[1.5px] border-ink bg-mint p-5">
          <span className="k-chip self-start">
            <HeartHandshake className="h-3.5 w-3.5" aria-hidden="true" />
            Recovery moment
          </span>
          {log.positive_cope_chosen ? (
            <>
              <h2 className="text-xl leading-snug font-bold text-ink" data-testid="today-cope">
                {log.positive_cope_chosen}
              </h2>
              <p className="text-xs text-ink-soft">
                You picked this today. Come back to it anytime.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl leading-snug font-bold text-ink" data-testid="today-cope">
                Not picked yet
              </h2>
              <p className="text-xs text-ink-soft">
                There are 3 quick recovery moments waiting, picked from your answers.
              </p>
            </>
          )}
          <Button asChild variant="secondary" className="mt-auto self-start">
            <Link to="/cope">
              {log.positive_cope_chosen ? 'Open it again' : 'Pick a recovery moment'}
            </Link>
          </Button>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border-[1.5px] border-ink bg-lavender p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="k-chip">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />3 Daily Wins
            </span>
            <span className="font-serif text-2xl font-bold text-ink" data-testid="today-wins-count">
              {log.wins_completed_count} / 3
            </span>
          </div>

          <ul className="space-y-2">
            {pillars.map((pillar) => {
              const item = log.wins_data[pillar];
              return (
                <li
                  key={pillar}
                  className="flex items-start gap-3 rounded-2xl bg-surface/70 px-3 py-2.5"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink ${
                      item.completed ? 'bg-ink text-cream' : 'bg-surface'
                    }`}
                  >
                    {item.completed ? (
                      <Check className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Circle className="h-2 w-2 opacity-0" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block text-[11px] font-bold text-ink-soft">
                      {PILLAR_LABEL[pillar]} · {item.completed ? 'done' : 'to do'}
                    </span>
                    <span className={item.completed ? 'text-ink-soft line-through' : 'text-ink'}>
                      {item.title}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <Button asChild className="self-start">
            <Link to={allDone ? '/profile' : '/wins'}>
              {allDone ? 'See my recovery trail' : 'Go to my 3 Daily Wins'}
            </Link>
          </Button>
        </section>
      </div>

      <p className="flex items-center gap-2 text-xs text-ink-soft">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Your check-in stays locked until tomorrow, so your goals stay consistent all day.
      </p>
    </div>
  );
}
