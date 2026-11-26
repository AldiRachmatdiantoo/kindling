import {
  ArrowRight,
  CheckCircle2,
  Info,
  Clock,
  Leaf,
  PenLine,
  Play,
  Timer,
  Wind,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import type { CopeOption, DailyLog } from '../../api/types';
import { CheckinPending } from '../../components/CheckinPending';
import { FocusRoom } from '../../components/FocusRoom';
import { DisclaimerBanner } from '../../components/DisclaimerBanner';
import { FeatureTip } from '../../components/FeatureTip';
import { Mascot } from '../../components/Mascot';
import { SafetyBanner } from '../../components/SafetyBanner';
import { moodGreeting, TIER_META, TIER_MOOD } from '../today/tier';
import { useTodayStatus } from '../today/TodayStatus';
import { skipRecovery } from '../today/recovery';
import { aiNoteText } from '../today/aiNote';
import { useAuth } from '../auth/AuthContext';
import { PageLoading } from '../../components/PageLoading';
import { Button } from '@/components/watermelon-ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const TOOL_ICON = {
  breathing: Wind,
  timer: Timer,
  brain_dump: PenLine,
} as const;

// Each option keeps one signal color on its icon; the cards themselves stay calm (Figma).
const COPE_ICON_TINT = ['text-sun-strong', 'text-lavender-strong', 'text-mint-strong'];

export function CopePage() {
  const { user } = useAuth();
  const { setStatus, reportLog } = useTodayStatus();
  const location = useLocation();
  const navigate = useNavigate();
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
        reportLog(log);
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
  }, [dailyLog, activeOption, setStatus, reportLog]);

  // After a pick, bring the tool into view: on a phone it opens below the fold.
  const toolRef = useRef<HTMLDivElement>(null);
  const [pickCount, setPickCount] = useState(0);
  const [roomOpen, setRoomOpen] = useState(false);
  const openRoomRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pickCount === 0) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
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
      setRoomOpen(true);
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
      barColor: 'bg-peach-strong',
      textColor: 'text-peach-strong',
    },
    {
      key: 'work_exhaustion',
      label: 'Work Exhaustion',
      value: dailyLog.scores.work_exhaustion,
      hint: 'Higher = more drained',
      barColor: 'bg-sun-strong',
      textColor: 'text-sun-strong',
    },
    {
      key: 'disengagement',
      label: 'Disengagement',
      value: dailyLog.scores.disengagement,
      hint: 'Higher = more checked out',
      barColor: 'bg-sky-strong',
      textColor: 'text-sky-strong',
    },
    {
      key: 'soul_wellbeing',
      label: 'Soul Well-Being',
      value: dailyLog.scores.soul_wellbeing,
      hint: 'Higher = better',
      barColor: 'bg-mint-strong',
      textColor: 'text-mint-strong',
    },
  ];

  return (
    <div className="space-y-8">
      {dailyLog.safety_flag && <SafetyBanner />}

      {/* Only the fresh check-in response carries a note; a reload drops it, which is fine. */}
      {aiNoteText(initialLog?.ai_note) && (
        <div
          className="flex items-start gap-2.5 rounded-2xl border border-sky-strong/40 bg-sky px-4 py-3 text-sm text-ink"
          role="status"
          data-testid="ai-note"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{aiNoteText(initialLog?.ai_note)}</span>
        </div>
      )}

      <Card asChild className="space-y-4 p-6 sm:p-7">
        <section>
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
            <Badge
              variant="primary"
              className={tierInfo.badgeClass}
              data-testid="calibration-tier-badge"
            >
              <Leaf aria-hidden="true" />
              {tierInfo.label}
            </Badge>
          </div>

          <p
            className="max-w-3xl font-serif text-lg leading-snug font-semibold text-ink sm:text-xl"
            data-testid="mood-greeting"
          >
            {moodGreeting(dailyLog.calibration_tier, dailyLog.scores)}
          </p>
          <p
            className="max-w-3xl text-sm leading-relaxed text-ink"
            data-testid="diagnostic-summary"
          >
            {dailyLog.diagnostic_summary}
          </p>
          <p className="text-xs text-ink-soft">{tierInfo.desc}</p>

          <FeatureTip id="cope-map" title="How to read your energy map" mood="calm">
            <p>
              Each bar is one part of how you're doing today. For the first three, a higher number
              means more worn out. For Soul Well-Being, higher is better. The mode badge up top
              tells you how big today's goals will be.
            </p>
          </FeatureTip>

          <div className="grid grid-cols-2 gap-3 pt-1 lg:grid-cols-4">
            {scoreCards.map((item) => (
              <Card
                key={item.key}
                className="rounded-2xl bg-surface-2 p-4"
                data-testid={`score-${item.key}`}
              >
                <span className="block text-xs font-semibold text-ink-soft">{item.label}</span>
                <span className={`k-tinted-num mt-1 block font-serif text-3xl font-bold ${item.textColor}`}>
                  {item.value}
                </span>
                <Progress
                  value={item.value}
                  aria-label={`${item.label}: ${item.value} of 100`}
                  className="mt-2 bg-ink/10"
                  indicatorClassName={`k-bar ${item.barColor}`}
                />
                <p className="mt-1.5 text-[11px] text-ink-faint">{item.hint}</p>
              </Card>
            ))}
          </div>
        </section>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-faint">Choose your own positive cope</p>
            <h2 className="mt-0.5 text-2xl font-bold text-ink">Pick 1 recovery moment</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {dailyLog.positive_cope_chosen
                ? 'Your 3 Daily Wins are open. Come back to this moment any time today.'
                : 'Settle your nervous system first. Your 3 Daily Wins open after one recovery moment.'}
            </p>
          </div>
          {dailyLog.positive_cope_chosen ? (
            <Button asChild variant="secondary">
              <Link to="/wins" data-testid="skip-to-wins">
                Go to my 3 Wins
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              data-testid="skip-recovery"
              onClick={() => {
                if (user) skipRecovery(user.id, dailyLog.log_date);
                navigate('/wins');
              }}
            >
              Not today? Skip recovery
            </Button>
          )}
        </div>

        {error && (
          <div className="k-error" role="alert">
            {error}
          </div>
        )}

        <FeatureTip id="cope-pick" title="Pick whatever feels good right now">
          <p>
            Tap any card to pick it, and it opens in a quiet full-screen room, ready to go. Changed
            your mind? Close it and tap another one. They're all short, so there's no wrong choice.
          </p>
        </FeatureTip>

        <div className="grid gap-3 md:grid-cols-3">
          {dailyLog.cope_options.map((option, index) => {
            const Icon = TOOL_ICON[option.tool_type] ?? Timer;
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
                className={`k-press flex flex-col justify-between gap-4 rounded-3xl border p-5 text-left transition-colors disabled:cursor-wait ${
                  isSelected
                    ? 'border-primary bg-primary-soft'
                    : 'border-line bg-surface hover:border-line-strong'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 ${
                        COPE_ICON_TINT[index % COPE_ICON_TINT.length]
                      }`}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <Badge className="capitalize">
                      {option.brief_cope_category.replace(/_/g, ' ')}
                    </Badge>
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
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      isSelected ? 'bg-lime' : 'border border-line bg-surface-2 text-ink'
                    }`}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {activeOption && (
          <div
            ref={toolRef}
            className="flex scroll-mt-28 flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-surface p-5"
            data-testid="active-cope-tool"
          >
            <div className="flex items-center gap-3">
              <Mascot mood="calm" className="h-14 w-12 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-ink-faint">Your recovery moment</p>
                <p className="font-serif text-lg font-bold text-ink">{activeOption.title}</p>
                <p className="text-xs text-ink-soft">
                  Your timer keeps going even if you close the room.
                </p>
              </div>
            </div>
            <Button
              ref={openRoomRef}
              onClick={() => setRoomOpen(true)}
              data-testid="open-focus-room"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Open focus room
            </Button>
          </div>
        )}
        {activeOption && roomOpen && (
          <FocusRoom
            option={activeOption}
            persistKey={
              user
                ? `${user.id}:${dailyLog.log_date}:cope:${activeOption.id}`
                : `${dailyLog.log_date}:cope:${activeOption.id}`
            }
            onClose={() => {
              setRoomOpen(false);
              // The picked card was disabled while saving, so focus returns here instead.
              window.requestAnimationFrame(() => openRoomRef.current?.focus());
            }}
          />
        )}
      </section>

      <DisclaimerBanner />
    </div>
  );
}
