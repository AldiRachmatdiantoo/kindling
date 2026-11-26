import { ArrowRight, CheckCircle2, Clock, Leaf, PenLine, Play, Timer, Wind } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import type { CopeOption, DailyLog } from '../../api/types';
import { BreathingPacer, pickBreathingPattern } from '../../components/BreathingPacer';
import { CheckinPending } from '../../components/CheckinPending';
import { CountdownTimer } from '../../components/CountdownTimer';
import { DisclaimerBanner } from '../../components/DisclaimerBanner';
import { FeatureTip } from '../../components/FeatureTip';
import { GuidedBrainDump } from '../../components/GuidedBrainDump';
import { Mascot } from '../../components/Mascot';
import { SafetyBanner } from '../../components/SafetyBanner';
import { TIER_META, TIER_MOOD } from '../today/tier';
import { useTodayStatus } from '../today/TodayStatus';
import { PageLoading } from '../../components/PageLoading';
import { Button } from '@/components/watermelon-ui/button';

const TOOL_ICON = {
  breathing: Wind,
  timer: Timer,
  brain_dump: PenLine,
} as const;

const COPE_CARD_BG = ['bg-mint', 'bg-lavender', 'bg-sky'];

export function CopePage() {
  const { setStatus } = useTodayStatus();
  const location = useLocation();
  const initialLog = (location.state as { dailyLog?: DailyLog } | null)?.dailyLog ?? null;

  const [dailyLog, setDailyLog] = useState<DailyLog | null>(initialLog);
  const [loading, setLoading] = useState(!initialLog);
  const [pending, setPending] = useState(false);
  const [activeOption, setActiveOption] = useState<CopeOption | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dailyLog) {
      if (dailyLog.positive_cope_chosen && !activeOption) {
        const matched = dailyLog.cope_options.find(
          (c) => c.title === dailyLog.positive_cope_chosen,
        );
        if (matched) setActiveOption(matched);
      }
      return;
    }

    let active = true;
    checkinApi
      .getToday()
      .then((log) => {
        if (!active) return;
        setDailyLog(log);
        setStatus('done');
        if (log.positive_cope_chosen) {
          const matched = log.cope_options.find((c) => c.title === log.positive_cope_chosen);
          if (matched) setActiveOption(matched);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setPending(true);
          setStatus('open');
          return;
        }
        setError("We couldn't load today's check-in results.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dailyLog, activeOption, setStatus]);

  // After a pick, bring the tool into view: on a phone it opens below the fold.
  const toolRef = useRef<HTMLDivElement>(null);
  const [pickCount, setPickCount] = useState(0);
  useEffect(() => {
    if (pickCount === 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    toolRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [pickCount]);

  const handleChooseCope = async (option: CopeOption) => {
    if (!dailyLog) return;
    setError(null);
    setSavingId(option.id);
    try {
      const res = await checkinApi.chooseCope(dailyLog.log_date, option.id);
      setDailyLog((prev) =>
        prev ? { ...prev, positive_cope_chosen: res.positive_cope_chosen } : prev,
      );
      setActiveOption(option);
      setPickCount((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't save that pick. Try again?");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <PageLoading testId="cope-loading" />;
  }

  if (pending) {
    return (
      <CheckinPending
        title="Your Energy Map for Today"
        unlocks="Your energy map and 3 recovery picks are built from your check-in answers."
        testId="cope-pending"
      />
    );
  }

  if (!dailyLog) {
    return (
      <div
        className="k-error mx-auto max-w-md p-6 text-center"
        data-testid="cope-load-error"
        role="alert"
      >
        <p>{error || "Today's results aren't loading right now."}</p>
        <Button onClick={() => window.location.reload()} variant="secondary" className="mt-4">
          Reload
        </Button>
      </div>
    );
  }

  const tierInfo = TIER_META[dailyLog.calibration_tier];
  const scoreCards = [
    {
      key: 'physical_exhaustion',
      label: 'Physical Exhaustion',
      value: dailyLog.scores.physical_exhaustion,
      hint: 'Higher = more tired',
      barColor: 'bg-primary',
    },
    {
      key: 'work_exhaustion',
      label: 'Work Exhaustion',
      value: dailyLog.scores.work_exhaustion,
      hint: 'Higher = more drained',
      barColor: 'bg-lavender-strong',
    },
    {
      key: 'disengagement',
      label: 'Disengagement',
      value: dailyLog.scores.disengagement,
      hint: 'Higher = more checked out',
      barColor: 'bg-lime-dark',
    },
    {
      key: 'soul_wellbeing',
      label: 'Soul Well-Being',
      value: dailyLog.scores.soul_wellbeing,
      hint: 'Higher = better',
      barColor: 'bg-mint-strong',
    },
  ];

  return (
    <div className="space-y-8">
      {dailyLog.safety_flag && <SafetyBanner />}

      <section className="k-card space-y-4 p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-end gap-3">
            <Mascot
              mood={TIER_MOOD[dailyLog.calibration_tier]}
              className="k-pop h-20 w-16 shrink-0"
            />
            <div>
              <p className="text-xs font-semibold text-ink-faint">
                Your results · {dailyLog.log_date}
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
                Your Energy Map for Today
              </h1>
            </div>
          </div>
          <span className={`k-chip ${tierInfo.badgeClass}`} data-testid="calibration-tier-badge">
            <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
            {tierInfo.label}
          </span>
        </div>

        <p className="max-w-3xl text-sm leading-relaxed text-ink" data-testid="diagnostic-summary">
          {dailyLog.diagnostic_summary}
        </p>
        <p className="text-xs text-ink-soft">{tierInfo.desc}</p>

        <FeatureTip id="cope-map" title="How to read your energy map" mood="calm">
          <p>
            Each bar is one part of how you're doing today. For the first three, a higher number
            means more worn out. For Soul Well-Being, higher is better. The mode badge up top tells
            you how big today's goals will be.
          </p>
        </FeatureTip>

        <div className="grid grid-cols-2 gap-3 pt-1 lg:grid-cols-4">
          {scoreCards.map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border-[1.5px] border-ink bg-cream p-4"
              data-testid={`score-${item.key}`}
            >
              <span className="block text-xs font-semibold text-ink-soft">{item.label}</span>
              <span className="mt-1 block font-serif text-3xl font-bold text-ink">
                {item.value}
              </span>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`k-bar h-full rounded-full ${item.barColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, item.value))}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-faint">Choose your own positive cope</p>
            <h2 className="mt-0.5 text-2xl font-bold text-ink">Pick 1 recovery moment</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Give your nervous system a breather first, or head straight to your 3 Daily Wins if
              you're ready.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link to="/wins" data-testid="skip-to-wins">
              Skip to my 3 Wins
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {error && (
          <div className="k-error" role="alert">
            {error}
          </div>
        )}

        <FeatureTip id="cope-pick" title="Pick whatever feels good right now">
          <p>
            Tap any card to pick it, and its tool opens right below, ready to go. Changed your mind?
            Just tap another one. They're all short, so there's no wrong choice.
          </p>
        </FeatureTip>

        <div className="grid gap-3 md:grid-cols-3">
          {dailyLog.cope_options.map((option, index) => {
            const Icon = TOOL_ICON[option.tool_type];
            const isSelected =
              activeOption?.id === option.id || dailyLog.positive_cope_chosen === option.title;
            const minutes = Math.max(1, Math.round(option.duration_seconds / 60));

            return (
              <button
                key={option.id}
                type="button"
                disabled={savingId !== null}
                onClick={() => handleChooseCope(option)}
                data-testid={`cope-card-${option.id}`}
                aria-pressed={isSelected}
                className={`k-press flex flex-col justify-between gap-4 rounded-3xl border-[1.5px] border-ink p-5 text-left disabled:cursor-wait ${
                  COPE_CARD_BG[index % COPE_CARD_BG.length]
                } ${isSelected ? 'ring-4 ring-primary/40' : ''}`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="k-chip capitalize">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {option.brief_cope_category.replace(/_/g, ' ')}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {minutes} min
                    </span>
                  </div>
                  <h3 className="text-xl leading-snug font-bold text-ink">{option.title}</h3>
                  <p className="text-xs leading-relaxed text-ink-soft">{option.guidance}</p>
                </div>

                <div className="flex items-center justify-between text-sm font-bold">
                  {savingId === option.id ? (
                    <span className="text-ink-soft">Saving...</span>
                  ) : isSelected ? (
                    <span className="inline-flex items-center gap-1.5 text-ink">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Picked for today
                    </span>
                  ) : (
                    <span className="text-ink-soft">Pick and start</span>
                  )}
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-ink bg-lime">
                    <Play className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {activeOption && (
          <div ref={toolRef} className="scroll-mt-28 space-y-3 pt-2" data-testid="active-cope-tool">
            {activeOption.tool_type === 'breathing' && (
              <FeatureTip id="cope-tool-breathing" title="Let the circle lead" mood="calm">
                <p>
                  Press Start and follow along. Breathe in while the circle grows, hold while it
                  waits, and breathe out while it shrinks. You can pause anytime.
                </p>
              </FeatureTip>
            )}
            {activeOption.tool_type === 'timer' && (
              <FeatureTip
                id="cope-tool-timer"
                title="Press Start, then put your phone down"
                mood="calm"
              >
                <p>
                  The timer keeps track so you don't have to. Just enjoy the activity, and come back
                  when it says time's up.
                </p>
              </FeatureTip>
            )}
            {activeOption.tool_type === 'brain_dump' && (
              <FeatureTip id="cope-tool-brain-dump" title="Messy is perfect here" mood="calm">
                <p>
                  Type whatever is buzzing around your head. Nothing in this box gets saved. When
                  you're done, press Let it go and watch it all disappear.
                </p>
              </FeatureTip>
            )}
            {activeOption.tool_type === 'breathing' && (
              <BreathingPacer
                pattern={pickBreathingPattern(`${activeOption.title} ${activeOption.guidance}`)}
                durationSeconds={activeOption.duration_seconds}
                guidance={activeOption.guidance}
                persistKey={`${dailyLog.log_date}:cope:${activeOption.id}`}
              />
            )}
            {activeOption.tool_type === 'timer' && (
              <CountdownTimer
                durationSeconds={activeOption.duration_seconds}
                title={activeOption.title}
                subtitle={activeOption.guidance}
                testIdPrefix="cope-activity"
                persistKey={`${dailyLog.log_date}:cope:${activeOption.id}`}
              />
            )}
            {activeOption.tool_type === 'brain_dump' && (
              <GuidedBrainDump
                durationSeconds={activeOption.duration_seconds}
                guidance={activeOption.guidance}
                persistKey={`${dailyLog.log_date}:cope:${activeOption.id}`}
              />
            )}
          </div>
        )}
      </section>

      <DisclaimerBanner />
    </div>
  );
}
