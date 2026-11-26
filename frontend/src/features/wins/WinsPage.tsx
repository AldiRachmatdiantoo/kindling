import {
  Check,
  ChevronDown,
  Feather,
  HeartHandshake,
  Lightbulb,
  Lock,
  RefreshCw,
  Scissors,
  Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, generateIdempotencyKey } from '../../api/client';
import { checkinApi, winsApi } from '../../api/endpoints';
import { sliceTaskSchema } from '../../api/schemas';
import type { DailyLog, Pillar } from '../../api/types';
import { CelebrationOverlay, type Celebration } from '../../components/CelebrationOverlay';
import { TaskMorphOverlay, type TaskMorph } from '../../components/TaskMorphOverlay';
import { CheckinPending } from '../../components/CheckinPending';
import { FeatureTip } from '../../components/FeatureTip';
import { Mascot, PILLAR_MASCOT } from '../../components/Mascot';
import { MascotBubble } from '../../components/MascotBubble';
import { useTodayStatus } from '../today/TodayStatus';
import { isRecoverySkipped, skipRecovery } from '../today/recovery';
import { aiNoteText } from '../today/aiNote';
import { useAuth } from '../auth/AuthContext';
import { CountdownTimer } from '../../components/CountdownTimer';
import { PageLoading } from '../../components/PageLoading';
import { Button } from '@/components/watermelon-ui/button';

const PILLAR_META: Record<Pillar, { label: string; subtitle: string; bg: string }> = {
  physical: {
    label: 'Physical Win',
    subtitle: 'Be kind to your body',
    bg: 'bg-mint',
  },
  work: {
    label: 'Work Win',
    subtitle: 'One tiny step, zero overwhelm',
    bg: 'bg-lavender',
  },
  soul: {
    label: 'Soul Win',
    subtitle: 'A quiet moment just for you',
    bg: 'bg-sky',
  },
};

// Mirrors the backend's RecalibratedWhyThis: once a goal shrinks, its old reason and steps no longer fit.
const RECALIBRATED_WHY =
  'You asked for something lighter, so here is a smaller version. Any step still counts.';

const pillars: Pillar[] = ['physical', 'work', 'soul'];

// The shrink/slice moment plays at least this long, even on a fast server, so the change reads
// as the goal being reworked rather than a text swap.
const holdMorph = () => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return new Promise((resolve) => window.setTimeout(resolve, reduce ? 0 : 2200));
};

// Each sliced step gets its own focus timer, so the next step starts fresh.
const timerKey = (userId: string, date: string, pillar: Pillar, stepsDone = 0) =>
  pillar === 'work'
    ? `${userId}:${date}:win:work-focus:${stepsDone}`
    : `${userId}:${date}:win:${pillar}`;

// Details start folded so all three goals fit on one screen; a timer still running from
// earlier keeps its card open, so the user lands back where they were.
function initialOpenDetails(
  userId: string | undefined,
  date: string,
  stepsDone = 0,
): Record<Pillar, boolean> {
  if (!userId) return { physical: false, work: false, soul: false };
  const running = (pillar: Pillar) => {
    try {
      const raw = sessionStorage.getItem(
        `kindling:timer:${timerKey(userId, date, pillar, stepsDone)}`,
      );
      return Boolean(raw && JSON.parse(raw).running);
    } catch {
      return false;
    }
  };
  return { physical: running('physical'), work: running('work'), soul: running('soul') };
}

export function WinsPage() {
  const { user } = useAuth();
  const { setStatus, reportLog } = useTodayStatus();

  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverySkipped, setRecoverySkipped] = useState(false);
  const [justCompleted, setJustCompleted] = useState<Pillar | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebrationId = useRef(0);
  const [morph, setMorph] = useState<TaskMorph | null>(null);
  const morphId = useRef(0);
  const startMorph = (m: Omit<TaskMorph, 'id' | 'to'>) => {
    morphId.current += 1;
    setMorph({ ...m, id: morphId.current, to: null });
  };
  const finishMorph = (to: string, label?: string, note?: string) =>
    setMorph((m) => (m ? { ...m, to, ...(label ? { label } : {}), ...(note ? { note } : {}) } : m));
  const [shrunkPillar, setShrunkPillar] = useState<Pillar | null>(null);
  // What each goal said before its last "Still too heavy", shown struck through under the new one.
  const [previousTitle, setPreviousTitle] = useState<Partial<Record<Pillar, string>>>({});

  const [openDetails, setOpenDetails] = useState<Record<Pillar, boolean>>({
    physical: false,
    work: false,
    soul: false,
  });

  const [togglingPillar, setTogglingPillar] = useState<Pillar | null>(null);
  const [recalibratingPillar, setRecalibratingPillar] = useState<Pillar | null>(null);

  const [taskInput, setTaskInput] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [slicing, setSlicing] = useState(false);
  // The micro-step whose focus block is finished; the choice "next step or win here" shows for it.
  const [finishedStep, setFinishedStep] = useState<string | null>(null);
  const currentMicroStep = dailyLog?.wins_data.work.micro_step ?? null;
  const handleFocusComplete = useCallback(() => {
    if (currentMicroStep) setFinishedStep(currentMicroStep);
  }, [currentMicroStep]);

  useEffect(() => {
    let active = true;
    checkinApi
      .getToday()
      .then((log) => {
        if (!active) return;
        setDailyLog(log);
        setRecoverySkipped(user ? isRecoverySkipped(user.id, log.log_date) : false);
        setOpenDetails(
          initialOpenDetails(user?.id, log.log_date, log.wins_data.work.steps_done ?? 0),
        );
        reportLog(log);
        if (log.wins_data.work.main_task) {
          setTaskInput(log.wins_data.work.main_task);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          // No check-in yet (often a deliberate "Answer later"): show the pending dashboard.
          setPending(true);
          setStatus('open');
          return;
        }
        setError(
          "We couldn't load today's 3 Daily Wins. Check your connection and reload the page.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [setStatus, reportLog, user?.id]);

  const handleToggle = async (pillar: Pillar) => {
    if (!dailyLog) return;
    setError(null);
    setTogglingPillar(pillar);
    const nextCompleted = !dailyLog.wins_data[pillar].completed;

    try {
      const res = await winsApi.toggle(dailyLog.log_date, pillar, nextCompleted);
      setDailyLog((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          wins_completed_count: res.wins_completed_count,
          wins_data: {
            ...prev.wins_data,
            [pillar]: {
              ...prev.wins_data[pillar],
              completed: res.completed,
            },
          },
        };
      });
      setJustCompleted(res.completed ? pillar : null);
      // Marking done (never undo) brings out the pillar's mascot; the third win brings the whole crew.
      if (res.completed) {
        celebrationId.current += 1;
        setCelebration(
          res.wins_completed_count >= 3
            ? { id: celebrationId.current, kind: 'all' }
            : { id: celebrationId.current, kind: 'win', pillar, count: res.wins_completed_count },
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't update that win. Try again?");
    } finally {
      setTogglingPillar(null);
    }
  };

  const handleRecalibrate = async (pillar: Pillar) => {
    if (!dailyLog) return;
    setError(null);
    setRecalibratingPillar(pillar);
    const oldTitle = dailyLog.wins_data[pillar].title;
    const workStep = pillar === 'work' ? dailyLog.wins_data.work.micro_step : null;
    startMorph({ kind: 'shrink', pillar, from: workStep || oldTitle });

    try {
      const idempotencyKey = generateIdempotencyKey();
      const [res] = await Promise.all([
        winsApi.recalibrate(dailyLog.log_date, pillar, idempotencyKey),
        holdMorph(),
      ]);
      finishMorph(res.new_title, `Level ${res.level}`, aiNoteText(res.ai_note));
      setShrunkPillar(pillar);
      if (
        !(pillar === 'work' && dailyLog.wins_data.work.micro_step) &&
        res.new_title !== oldTitle
      ) {
        setPreviousTitle((prev) => ({ ...prev, [pillar]: oldTitle }));
      }

      setDailyLog((prev) => {
        if (!prev) return prev;
        const currentPillar = prev.wins_data[pillar];
        const wasCompleted = currentPillar.completed;
        const nextCount = wasCompleted
          ? Math.max(0, prev.wins_completed_count - 1)
          : prev.wins_completed_count;

        if (pillar === 'work') {
          const hasMicroStep = Boolean(prev.wins_data.work.micro_step);
          return {
            ...prev,
            wins_completed_count: nextCount,
            wins_data: {
              ...prev.wins_data,
              work: {
                ...prev.wins_data.work,
                title: hasMicroStep ? prev.wins_data.work.title : res.new_title,
                micro_step: hasMicroStep ? res.new_title : prev.wins_data.work.micro_step,
                ...(hasMicroStep ? {} : { why_this: RECALIBRATED_WHY, steps: [] }),
                duration_seconds: res.duration_seconds ?? prev.wins_data.work.duration_seconds,
                level: res.level,
                completed: false,
              },
            },
          };
        }

        return {
          ...prev,
          wins_completed_count: nextCount,
          wins_data: {
            ...prev.wins_data,
            [pillar]: {
              ...currentPillar,
              title: res.new_title,
              why_this: RECALIBRATED_WHY,
              steps: [],
              duration_seconds: null,
              level: res.level,
              completed: false,
            },
          },
        };
      });
    } catch (err) {
      setMorph(null);
      setError(
        err instanceof ApiError ? err.message : "We couldn't shrink that goal just now. Try again?",
      );
    } finally {
      setRecalibratingPillar(null);
    }
  };

  const sliceNextStep = async () => {
    if (!dailyLog?.wins_data.work.main_task) return;
    setTaskError(null);
    setError(null);
    setSlicing(true);
    startMorph({ kind: 'slice', pillar: 'work', from: dailyLog.wins_data.work.main_task });
    try {
      const [res] = await Promise.all([
        winsApi.sliceTask(
          dailyLog.log_date,
          dailyLog.wins_data.work.main_task,
          generateIdempotencyKey(),
          true,
        ),
        holdMorph(),
      ]);
      finishMorph(res.micro_step, `Step ${res.steps_done + 1}`, aiNoteText(res.ai_note));
      setFinishedStep(null);
      setDailyLog((prev) =>
        prev
          ? {
              ...prev,
              wins_data: {
                ...prev.wins_data,
                work: {
                  ...prev.wins_data.work,
                  micro_step: res.micro_step,
                  duration_seconds: res.duration_seconds,
                  steps_done: res.steps_done,
                },
              },
            }
          : prev,
      );
    } catch (err) {
      setMorph(null);
      setTaskError(
        err instanceof ApiError ? err.message : "We couldn't find the next step. Try again?",
      );
    } finally {
      setSlicing(false);
    }
  };

  const handleSliceTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!dailyLog) return;
    setTaskError(null);
    setError(null);

    const parsed = sliceTaskSchema.safeParse({ main_task: taskInput });
    if (!parsed.success) {
      setTaskError(parsed.error.issues[0]?.message || 'Type a task first.');
      return;
    }

    setSlicing(true);
    startMorph({ kind: 'slice', pillar: 'work', from: parsed.data.main_task });
    try {
      const idempotencyKey = generateIdempotencyKey();
      const [res] = await Promise.all([
        winsApi.sliceTask(dailyLog.log_date, parsed.data.main_task, idempotencyKey),
        holdMorph(),
      ]);
      finishMorph(res.micro_step, `Step ${res.steps_done + 1}`, aiNoteText(res.ai_note));
      setDailyLog((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          wins_data: {
            ...prev.wins_data,
            work: {
              ...prev.wins_data.work,
              main_task: res.main_task,
              micro_step: res.micro_step,
              duration_seconds: res.duration_seconds,
              steps_done: res.steps_done,
            },
          },
        };
      });
    } catch (err) {
      setMorph(null);
      setTaskError(
        err instanceof ApiError ? err.message : "We couldn't break that task down. Try again?",
      );
    } finally {
      setSlicing(false);
    }
  };

  if (loading) {
    return <PageLoading testId="wins-loading" />;
  }

  if (pending) {
    return (
      <CheckinPending
        title="Today's Small Wins"
        unlocks="Your 3 Daily Wins are shaped by your check-in, so they fit the energy you have today."
        testId="wins-pending"
      />
    );
  }

  if (!dailyLog) {
    return (
      <div
        className="k-error mx-auto max-w-md p-6 text-center"
        data-testid="wins-load-error"
        role="alert"
      >
        <p>{error || "Today's data isn't loading right now."}</p>
        <Button onClick={() => window.location.reload()} variant="secondary" className="mt-4">
          Reload
        </Button>
      </div>
    );
  }

  if (!dailyLog.positive_cope_chosen && !recoverySkipped) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold text-ink-faint">
            Your 3 Daily Wins · {dailyLog.log_date}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Recovery first</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Your wins are ready. They open after one short recovery moment.
          </p>
        </div>

        <MascotBubble
          mood="calm"
          title="Settle first, then do"
          className="max-w-2xl"
          testId="wins-locked"
          actions={
            <>
              <Button asChild>
                <Link to="/cope" data-testid="wins-locked-go-cope">
                  <HeartHandshake className="h-4 w-4" aria-hidden="true" />
                  Pick a recovery moment
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="wins-skip-recovery"
                onClick={() => {
                  if (user) skipRecovery(user.id, dailyLog.log_date);
                  setRecoverySkipped(true);
                }}
              >
                Skip recovery today
              </Button>
            </>
          }
        >
          <p>
            A few minutes of breathing, a hobby, or a brain dump calms your nervous system, so the
            wins after it feel lighter. Pick whichever one you like.
          </p>
        </MascotBubble>

        <ul className="grid gap-3 sm:grid-cols-3" aria-label="Waiting for you">
          {pillars.map((pillar) => (
            <li
              key={pillar}
              className={`flex items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-ink p-4 ${PILLAR_META[pillar].bg}`}
            >
              <Mascot pillar={pillar} mood="calm" className="h-11 w-10 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">
                  {PILLAR_META[pillar].label}
                </span>
                <span className="block text-xs text-ink-soft">{PILLAR_META[pillar].subtitle}</span>
              </span>
              <Lock className="h-4 w-4 shrink-0 text-ink" aria-label="Locked" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} />
      <TaskMorphOverlay morph={morph} onClose={() => setMorph(null)} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-ink-faint">
            Your 3 Daily Wins · {dailyLog.log_date}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Today's Small Wins</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Just today, nothing more. If a goal feels too heavy, you can always shrink it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="k-chip bg-lime px-3.5 py-1.5 text-sm" data-testid="wins-progress-badge">
            <Trophy className="h-4 w-4" aria-hidden="true" />
            {/* Re-keyed on change so the count pops when a win lands. */}
            <span key={dailyLog.wins_completed_count} className="k-pop inline-block">
              {dailyLog.wins_completed_count} / 3
            </span>
            done
          </span>
          <Button asChild variant="secondary">
            <Link to="/cope">
              <HeartHandshake className="h-4 w-4" aria-hidden="true" />
              Positive Cope
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="k-error" data-testid="wins-error" role="alert">
          {error}
        </div>
      )}

      <FeatureTip id="wins-how" title="How your 3 Daily Wins work">
        <p>
          Each card is one small goal. Do it, then tap Mark as done. If one feels like too much, tap
          Still too heavy and I'll make it smaller. Even one win counts as a good day.
        </p>
      </FeatureTip>

      {dailyLog.wins_completed_count >= 3 && (
        <MascotBubble
          mood="cheer"
          title="3 out of 3. You did it!"
          className="max-w-2xl"
          testId="wins-celebration"
          actions={
            <Button asChild>
              <Link to="/profile">See my recovery trail</Link>
            </Button>
          }
        >
          <p>
            It was never about how big the goals were. Today you looked after your body, your work,
            and your heart.
          </p>
          <div className="mt-3 flex items-end gap-1">
            {pillars.map((pillar) => (
              <Mascot key={pillar} pillar={pillar} mood="cheer" className="k-pop h-16 w-14" />
            ))}
          </div>
        </MascotBubble>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {pillars.map((pillar) => {
          const meta = PILLAR_META[pillar];
          const item = dailyLog.wins_data[pillar];
          const isToggling = togglingPillar === pillar;
          const isRecalibrating = recalibratingPillar === pillar;
          const isMaxGentle = item.level >= 3;
          const isOpen = openDetails[pillar];

          return (
            <article
              key={pillar}
              data-testid={`win-card-${pillar}`}
              className={`relative flex flex-col gap-3 overflow-hidden rounded-3xl border-[1.5px] border-ink p-4 sm:gap-4 sm:p-5 ${meta.bg} ${isRecalibrating ? 'k-recal' : ''}`}
              aria-busy={isRecalibrating || undefined}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Mascot
                    pillar={pillar}
                    mood={item.completed ? 'cheer' : 'happy'}
                    className={`h-11 w-10 shrink-0 sm:h-14 sm:w-12 ${justCompleted === pillar && item.completed ? 'k-pop' : ''}`}
                  />
                  <span className="k-chip">
                    {PILLAR_MASCOT[pillar].name} · {meta.label}
                  </span>
                </span>
                <span className="k-chip" data-testid={`win-level-${pillar}`}>
                  Level {item.level}
                </span>
              </div>

              <div
                key={item.level}
                className={shrunkPillar === pillar ? 'k-shrink-in' : undefined}
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
                {previousTitle[pillar] && item.level > 0 && (
                  <p className="mt-1 text-xs text-ink-soft" data-testid={`win-previous-${pillar}`}>
                    <span className="sr-only">Was: </span>
                    <s>{previousTitle[pillar]}</s>
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-soft">{meta.subtitle}</p>
                {item.level > 0 && (
                  <span
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink"
                    data-testid={`win-recal-${pillar}`}
                  >
                    <Feather className="h-3.5 w-3.5" aria-hidden="true" />
                    Made lighter {item.level}x · No penalty
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setOpenDetails((prev) => ({ ...prev, [pillar]: !prev[pillar] }))}
                aria-expanded={isOpen}
                aria-controls={`win-details-${pillar}`}
                data-testid={`win-details-toggle-${pillar}`}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl bg-surface/70 px-3.5 py-2 text-left text-sm font-bold text-ink hover:bg-surface"
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
                  <div
                    className="rounded-2xl bg-surface/70 px-3.5 py-3"
                    data-testid={`win-why-${pillar}`}
                  >
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
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm leading-snug text-ink"
                        >
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-surface text-[11px] font-bold"
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
                    persistKey={user ? timerKey(user.id, dailyLog.log_date, pillar) : undefined}
                    compact
                  />
                ) : null}

                {pillar === 'work' && (
                  <div className="space-y-3 rounded-2xl border-[1.5px] border-ink bg-surface p-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                      <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
                      AI Task Slicer (5–10 min)
                    </div>

                    <FeatureTip id="wins-slicer" title="Big task? Let's slice it" pillar="work">
                      <p>
                        Type the one task that feels heavy and tap Slice it. I'll turn it into a
                        single step you can finish in 5 to 10 minutes.
                      </p>
                    </FeatureTip>

                    <form
                      onSubmit={handleSliceTask}
                      className="flex gap-2"
                      data-testid="slice-task-form"
                    >
                      <input
                        type="text"
                        maxLength={300}
                        value={taskInput}
                        onChange={(e) => setTaskInput(e.target.value)}
                        data-testid="slice-task-input"
                        aria-label="Task to break down"
                        placeholder="One task that feels heavy..."
                        className="k-input min-h-11 min-w-0 flex-1 rounded-full px-3.5 py-2 text-xs"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={slicing}
                        data-testid="slice-task-submit"
                      >
                        {slicing ? 'Slicing...' : 'Slice it'}
                      </Button>
                    </form>
                    {taskError && (
                      <p className="text-xs font-medium text-peach-strong">{taskError}</p>
                    )}

                    {dailyLog.wins_data.work.micro_step && (
                      <div className="space-y-3" data-testid="work-micro-step-box">
                        <div className="rounded-xl bg-lavender p-3">
                          <span
                            className="block text-[11px] font-bold text-lavender-strong"
                            data-testid="work-step-number"
                          >
                            Step {(dailyLog.wins_data.work.steps_done ?? 0) + 1} · Your next tiny
                            step
                          </span>
                          <p
                            className="mt-1 text-xs leading-relaxed font-medium text-ink"
                            data-testid="work-micro-step"
                          >
                            {dailyLog.wins_data.work.micro_step}
                          </p>
                        </div>

                        <FeatureTip id="wins-timer" title="Just this one step" pillar="work">
                          <p>
                            Press Start on the focus timer and work on only this step. When it
                            rings, you're allowed to stop: win here, or slice the next step.
                          </p>
                        </FeatureTip>

                        <CountdownTimer
                          key={dailyLog.wins_data.work.steps_done ?? 0}
                          durationSeconds={dailyLog.wins_data.work.duration_seconds ?? 300}
                          title="Focus Timer"
                          testIdPrefix="focus"
                          persistKey={
                            user
                              ? timerKey(
                                  user.id,
                                  dailyLog.log_date,
                                  'work',
                                  dailyLog.wins_data.work.steps_done ?? 0,
                                )
                              : undefined
                          }
                          onComplete={handleFocusComplete}
                          compact
                        />

                        {item.completed ? null : finishedStep ===
                          dailyLog.wins_data.work.micro_step ? (
                          <div
                            className="k-shrink-in space-y-2 rounded-xl border-[1.5px] border-ink bg-lavender p-3"
                            data-testid="work-step-choice"
                            role="status"
                          >
                            <p className="text-xs font-bold text-ink">
                              Step {(dailyLog.wins_data.work.steps_done ?? 0) + 1} done. Keep going,
                              or call it a win?
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleToggle('work')}
                                disabled={isToggling}
                                data-testid="work-win-here"
                              >
                                <Trophy className="h-4 w-4" aria-hidden="true" />
                                Win here for today
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={sliceNextStep}
                                disabled={slicing}
                                data-testid="work-next-step"
                              >
                                <Scissors className="h-4 w-4" aria-hidden="true" />
                                {slicing ? 'Slicing...' : 'Slice the next step'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setFinishedStep(dailyLog.wins_data.work.micro_step)}
                            className="text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-ink"
                            data-testid="work-step-finished-early"
                          >
                            Finished this step early?
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {shrunkPillar === pillar && !morph && (
                <FeatureTip
                  autoOpen
                  id="wins-shrunk"
                  title="Done, it's smaller now"
                  pillar={pillar}
                  mood="calm"
                >
                  <p>
                    Still too much? Tap it again. Each tap makes the goal lighter, and at the
                    lightest level, resting counts as the win.
                  </p>
                </FeatureTip>
              )}

              <div className="mt-auto space-y-2 pt-1">
                <button
                  type="button"
                  disabled={isToggling}
                  onClick={() => handleToggle(pillar)}
                  data-testid={`win-toggle-${pillar}`}
                  aria-pressed={item.completed}
                  className={`k-press flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-ink px-4 py-2.5 text-sm font-bold disabled:opacity-60 ${
                    item.completed
                      ? 'bg-ink text-cream hover:bg-ink/85'
                      : 'bg-surface text-ink hover:bg-lime'
                  }`}
                >
                  <Check
                    key={item.completed ? 'done' : 'open'}
                    className={`h-4 w-4 ${justCompleted === pillar && item.completed ? 'k-pop' : ''}`}
                    aria-hidden="true"
                  />
                  {isToggling ? 'Saving...' : item.completed ? 'Done (undo)' : 'Mark as done'}
                </button>

                {isMaxGentle ? (
                  <div
                    className="flex items-start gap-2 rounded-2xl bg-surface/70 px-3.5 py-2.5 text-xs leading-relaxed text-ink"
                    data-testid={`rest-message-${pillar}`}
                  >
                    <Feather className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Resting is a valid choice too. It's okay to stop here for today.</span>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRecalibrating}
                    onClick={() => handleRecalibrate(pillar)}
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
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
