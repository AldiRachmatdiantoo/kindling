import { ArrowLeft, Trophy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { Link } from 'react-router-dom';
import { ApiError, generateIdempotencyKey } from '../../api/client';
import { checkinApi, profileApi, winsApi } from '../../api/endpoints';
import type { DailyLog, Pillar, PillarProgressSet } from '../../api/types';
import { CelebrationOverlay, type Celebration } from '../../components/CelebrationOverlay';
import { CheckinPending } from '../../components/CheckinPending';
import { FeatureTip } from '../../components/FeatureTip';
import { Mascot } from '../../components/Mascot';
import { MascotBubble } from '../../components/MascotBubble';
import { PageLoading } from '../../components/PageLoading';
import { TaskMorphOverlay, type TaskMorph } from '../../components/TaskMorphOverlay';
import { useAuth } from '../auth/AuthContext';
import { aiNoteText } from '../today/aiNote';
import { isRecoverySkipped, skipRecovery } from '../today/recovery';
import { useTodayStatus } from '../today/TodayStatus';
import { Button } from '@/components/watermelon-ui/button';
import { PILLARS, timerKey } from './constants';
import { RecoveryLockedView } from './RecoveryLockedView';
import { isRoadmap, RoadmapPanel } from './RoadmapPanel';
import { WinCard } from './WinCard';
import { WinRow } from './WinRow';
import { DayPlan } from '../today/DayPlan';
import { WorkPanel } from './WorkPanel';
import { Badge } from '@/components/ui/badge';

// Mirrors the backend's RecalibratedWhyThis: once a goal shrinks, its old reason and steps no longer fit.
const RECALIBRATED_WHY =
  'You asked for something lighter, so here is a smaller version. Any step still counts.';

// The shrink/slice moment plays at least this long, even on a fast server, so the change reads
// as the goal being reworked rather than a text swap.
const holdMorph = () => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return new Promise((resolve) => window.setTimeout(resolve, reduce ? 0 : 2200));
};

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

// The panel opens on the first win still to do, so the next step is one look away.
function firstOpenPillar(log: DailyLog): Pillar {
  return PILLARS.find((p) => !log.wins_data[p].completed) ?? 'physical';
}

export function WinsPage() {
  const { user } = useAuth();
  const { setStatus, reportLog } = useTodayStatus();

  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const dailyLogRef = useRef<DailyLog | null>(null);
  dailyLogRef.current = dailyLog;

  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverySkipped, setRecoverySkipped] = useState(false);
  const [justCompleted, setJustCompleted] = useState<Pillar | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [pathProgress, setPathProgress] = useState<PillarProgressSet | null>(null);
  const celebrationId = useRef(0);
  const [morph, setMorph] = useState<TaskMorph | null>(null);
  const morphId = useRef(0);
  const startMorph = useCallback((m: Omit<TaskMorph, 'id' | 'to'>) => {
    morphId.current += 1;
    setMorph({ ...m, id: morphId.current, to: null });
  }, []);
  const finishMorph = useCallback(
    (to: string, label?: string, note?: string) =>
      setMorph((m) =>
        m ? { ...m, to, ...(label ? { label } : {}), ...(note ? { note } : {}) } : m,
      ),
    [],
  );
  const [shrunkPillar, setShrunkPillar] = useState<Pillar | null>(null);
  // What each goal said before its last "Still too heavy", shown struck through under the new one.
  const [previousTitle, setPreviousTitle] = useState<Partial<Record<Pillar, string>>>({});

  const [openDetails, setOpenDetails] = useState<Record<Pillar, boolean>>({
    physical: false,
    work: false,
    soul: false,
  });

  // The win shown in the detail panel. On phones the panel replaces the list while open.
  const [selected, setSelected] = useState<Pillar>('physical');
  const [mobileOpen, setMobileOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const [steppingPillar, setSteppingPillar] = useState<Pillar | null>(null);

  const [togglingPillars, setTogglingPillars] = useState<Set<Pillar>>(() => new Set());
  const [recalibratingPillar, setRecalibratingPillar] = useState<Pillar | null>(null);
  const [swappingPillar, setSwappingPillar] = useState<Pillar | null>(null);

  const [slicing, setSlicing] = useState(false);
  // The micro-step whose focus block is finished; the choice "next step or win here" shows for it.
  const [finishedStep, setFinishedStep] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    checkinApi
      .getToday()
      .then((log) => {
        if (!active) return;
        setDailyLog(log);
        setSelected(firstOpenPillar(log));
        setRecoverySkipped(user ? isRecoverySkipped(user.id, log.log_date) : false);
        setOpenDetails(
          initialOpenDetails(user?.id, log.log_date, log.wins_data.work.steps_done ?? 0),
        );
        reportLog(log);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          // No check-in yet (opened by its address): show the pending dashboard.
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

  const handleToggleDetails = useCallback((pillar: Pillar) => {
    setOpenDetails((prev) => ({ ...prev, [pillar]: !prev[pillar] }));
  }, []);

  const handleSelect = useCallback((pillar: Pillar) => {
    setSelected(pillar);
    setMobileOpen(true);
  }, []);

  // On phones the panel takes the screen; bring its top into view when it opens.
  useEffect(() => {
    if (mobileOpen) detailRef.current?.scrollIntoView?.({ block: 'start' });
  }, [mobileOpen, selected]);

  // Marking a win done (never undo) brings out the pillar's mascot; the third brings the crew.
  const celebrate = useCallback((pillar: Pillar, count: number) => {
    celebrationId.current += 1;
    if (count >= 3) {
      // The finale's second beat shows each Milestone Path gaining today's step. If the
      // totals do not arrive, the crew celebration stands on its own.
      const id = celebrationId.current;
      setPathProgress(null);
      profileApi
        .getHeatmap()
        .then((data) => {
          if (celebrationId.current === id) setPathProgress(data.pillar_progress ?? null);
        })
        .catch(() => {});
    }
    setCelebration(
      count >= 3
        ? { id: celebrationId.current, kind: 'all' }
        : { id: celebrationId.current, kind: 'win', pillar, count },
    );
  }, []);

  const handleToggle = useCallback(
    async (pillar: Pillar) => {
      const current = dailyLogRef.current;
      if (!current) return;
      setError(null);
      setTogglingPillars((prev) => {
        const next = new Set(prev);
        next.add(pillar);
        return next;
      });
      const nextCompleted = !current.wins_data[pillar].completed;

      try {
        const res = await winsApi.toggle(current.log_date, pillar, nextCompleted);
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
        if (res.completed) celebrate(pillar, res.wins_completed_count);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "We couldn't update that win. Try again?");
      } finally {
        setTogglingPillars((prev) => {
          const next = new Set(prev);
          next.delete(pillar);
          return next;
        });
      }
    },
    [celebrate],
  );

  // A roadmap step done (or undone): the win counts once the floor step is reached.
  const handleProgress = useCallback(
    async (pillar: Pillar, stepsDone: number): Promise<string | null> => {
      const current = dailyLogRef.current;
      if (!current) return null;
      const wasCompleted = current.wins_data[pillar].completed;
      setSteppingPillar(pillar);
      try {
        const res = await winsApi.progress(current.log_date, pillar, stepsDone);
        setDailyLog((prev) =>
          prev
            ? {
                ...prev,
                wins_completed_count: res.wins_completed_count,
                wins_data: {
                  ...prev.wins_data,
                  [pillar]: {
                    ...prev.wins_data[pillar],
                    steps_done: res.steps_done,
                    completed: res.completed,
                  },
                },
              }
            : prev,
        );
        if (res.completed && !wasCompleted) celebrate(pillar, res.wins_completed_count);
        return null;
      } catch (err) {
        return err instanceof ApiError ? err.message : "We couldn't save that step. Try again?";
      } finally {
        setSteppingPillar(null);
      }
    },
    [celebrate],
  );

  // "Too big? Make it smaller": the current step becomes 2 smaller ones; the goal stays.
  const handleSplit = useCallback(async (pillar: Pillar, step: number): Promise<string | null> => {
    const current = dailyLogRef.current;
    if (!current) return null;
    setSteppingPillar(pillar);
    try {
      const res = await winsApi.splitStep(current.log_date, pillar, step, generateIdempotencyKey());
      setDailyLog((prev) =>
        prev
          ? {
              ...prev,
              wins_data: {
                ...prev.wins_data,
                [pillar]: {
                  ...prev.wins_data[pillar],
                  steps: res.steps,
                  floor_step: res.floor_step,
                  steps_done: res.steps_done,
                },
              },
            }
          : prev,
      );
      return null;
    } catch (err) {
      return err instanceof ApiError
        ? err.message
        : "We couldn't make that step smaller. Try again?";
    } finally {
      setSteppingPillar(null);
    }
  }, []);

  const handleRecalibrate = useCallback(
    async (pillar: Pillar) => {
      const current = dailyLogRef.current;
      if (!current) return;
      setError(null);
      setRecalibratingPillar(pillar);
      const oldTitle = current.wins_data[pillar].title;
      const workStep = pillar === 'work' ? current.wins_data.work.micro_step : null;
      startMorph({ kind: 'shrink', pillar, from: workStep || oldTitle });

      try {
        const idempotencyKey = generateIdempotencyKey();
        const [res] = await Promise.all([
          winsApi.recalibrate(current.log_date, pillar, idempotencyKey),
          holdMorph(),
        ]);
        finishMorph(res.new_title, `Level ${res.level}`, aiNoteText(res.ai_note));
        setFinishedStep(null);
        setShrunkPillar(pillar);
        if (
          !(pillar === 'work' && current.wins_data.work.micro_step) &&
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
                floor_step: 0,
                steps_done: 0,
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
          err instanceof ApiError
            ? err.message
            : "We couldn't shrink that goal just now. Try again?",
        );
      } finally {
        setRecalibratingPillar(null);
      }
    },
    [startMorph, finishMorph],
  );

  const handleSwap = useCallback(
    async (pillar: Pillar, activity: string): Promise<string | null> => {
      const current = dailyLogRef.current;
      if (!current) return null;
      setError(null);
      setSwappingPillar(pillar);
      startMorph({ kind: 'swap', pillar, from: current.wins_data[pillar].title });
      try {
        const [res] = await Promise.all([
          winsApi.swap(current.log_date, pillar, activity, generateIdempotencyKey()),
          holdMorph(),
        ]);
        finishMorph(res.win.title, 'Just for today', aiNoteText(res.ai_note));
        setPreviousTitle((prev) => ({ ...prev, [pillar]: undefined }));
        setOpenDetails((prev) => ({ ...prev, [pillar]: true }));
        setDailyLog((prev) =>
          prev ? { ...prev, wins_data: { ...prev.wins_data, [pillar]: res.win } } : prev,
        );
        return null;
      } catch (err) {
        setMorph(null);
        return err instanceof ApiError ? err.message : "We couldn't swap that just now. Try again?";
      } finally {
        setSwappingPillar(null);
      }
    },
    [startMorph, finishMorph],
  );

  const handleSliceNextStep = useCallback(async (): Promise<string | null> => {
    const current = dailyLogRef.current;
    if (!current?.wins_data.work.main_task) return null;
    setError(null);
    setSlicing(true);
    startMorph({ kind: 'slice', pillar: 'work', from: current.wins_data.work.main_task });
    try {
      const [res] = await Promise.all([
        winsApi.sliceTask(
          current.log_date,
          current.wins_data.work.main_task,
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
      return null;
    } catch (err) {
      setMorph(null);
      return err instanceof ApiError ? err.message : "We couldn't find the next step. Try again?";
    } finally {
      setSlicing(false);
    }
  }, [startMorph, finishMorph]);

  const handleSliceTask = useCallback(
    async (mainTask: string): Promise<string | null> => {
      const current = dailyLogRef.current;
      if (!current) return null;
      setError(null);
      setSlicing(true);
      startMorph({ kind: 'slice', pillar: 'work', from: mainTask });
      try {
        const idempotencyKey = generateIdempotencyKey();
        const [res] = await Promise.all([
          winsApi.sliceTask(current.log_date, mainTask, idempotencyKey),
          holdMorph(),
        ]);
        finishMorph(res.micro_step, `Step ${res.steps_done + 1}`, aiNoteText(res.ai_note));
        setFinishedStep(null);
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
        return null;
      } catch (err) {
        setMorph(null);
        return err instanceof ApiError
          ? err.message
          : "We couldn't break that task down. Try again?";
      } finally {
        setSlicing(false);
      }
    },
    [startMorph, finishMorph],
  );

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
      <RecoveryLockedView
        logDate={dailyLog.log_date}
        onSkipRecovery={() => {
          if (user) skipRecovery(user.id, dailyLog.log_date);
          setRecoverySkipped(true);
        }}
      />
    );
  }

  const selectedItem = dailyLog.wins_data[selected];
  // The first win still to do gets a "Next up" tag, so the list reads as a to-do with a start.
  const nextUp = PILLARS.find((pillar) => !dailyLog.wins_data[pillar].completed);
  const detail =
    selected === 'work' ? (
      <WorkPanel
        work={dailyLog.wins_data.work}
        logDate={dailyLog.log_date}
        userId={user?.id}
        slicing={slicing}
        isToggling={togglingPillars.has('work')}
        isRecalibrating={recalibratingPillar === 'work'}
        finishedStep={finishedStep}
        previousTitle={previousTitle.work}
        onFinishStep={setFinishedStep}
        onSliceTask={handleSliceTask}
        onSliceNextStep={handleSliceNextStep}
        onToggle={handleToggle}
        onRecalibrate={handleRecalibrate}
      />
    ) : isRoadmap(selectedItem) ? (
      <RoadmapPanel
        key={selected}
        pillar={selected}
        item={selectedItem}
        logDate={dailyLog.log_date}
        userId={user?.id}
        busy={steppingPillar === selected}
        onProgress={handleProgress}
        onSplit={handleSplit}
        onRecalibrate={handleRecalibrate}
        isRecalibrating={recalibratingPillar === selected}
        onSwap={handleSwap}
        isSwapping={swappingPillar === selected}
      />
    ) : (
      <WinCard
        key={selected}
        pillar={selected}
        item={selectedItem}
        logDate={dailyLog.log_date}
        userId={user?.id}
        isOpen={openDetails[selected]}
        isToggling={togglingPillars.has(selected)}
        isRecalibrating={recalibratingPillar === selected}
        justCompleted={justCompleted === selected}
        shrunk={shrunkPillar === selected}
        showShrunkTip={shrunkPillar === selected && !morph}
        previousTitle={previousTitle[selected]}
        onToggleDetails={handleToggleDetails}
        onToggle={handleToggle}
        onRecalibrate={handleRecalibrate}
        onSwap={handleSwap}
        isSwapping={swappingPillar === selected}
      />
    );

  return (
    <div className="space-y-6">
      <CelebrationOverlay
        celebration={celebration}
        pathProgress={pathProgress}
        onDone={() => setCelebration(null)}
      />
      <TaskMorphOverlay morph={morph} onClose={() => setMorph(null)} />

      {error && (
        <div className="k-error" data-testid="wins-error" role="alert">
          {error}
        </div>
      )}

      {/*
        A list of the three wins and one detail panel, like a desktop task app: side by side
        from xl (below that the sidebar leaves too little room), and on narrower screens the
        panel replaces the list until "Today's wins" brings it back.
      */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] xl:items-start xl:gap-6">
        <div className={`space-y-6 ${mobileOpen ? 'hidden xl:block' : ''}`} data-testid="wins-list">
          <DayPlan
            current="wins"
            copeDone={Boolean(dailyLog.positive_cope_chosen)}
            copeSkipped={recoverySkipped}
            winsDone={dailyLog.wins_completed_count}
          />

          <div>
            <p className="text-xs font-semibold text-ink-faint">
              Your to-do for today · {dailyLog.log_date}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Today's Small Wins</h1>
            <p className="mt-1 text-sm text-ink-soft">
              3 small things to tick off, in any order. Tap one to see its steps.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Badge
                className="border-mint-strong bg-transparent px-3.5 py-1.5 text-sm text-mint-strong"
                data-testid="wins-progress-badge"
              >
                <Trophy className="h-4 w-4" aria-hidden="true" />
                {/* Re-keyed on change so the new count rolls up into place when a win lands. */}
                <span className="inline-flex overflow-hidden">
                  <m.span
                    key={dailyLog.wins_completed_count}
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    className="inline-block"
                  >
                    {dailyLog.wins_completed_count} / 3
                  </m.span>
                </span>
                done
              </Badge>
              <div
                className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-ink/10"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-mint-strong transition-[width] duration-500"
                  style={{ width: `${(dailyLog.wins_completed_count / 3) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <FeatureTip id="wins-how" title="How your 3 Daily Wins work">
            <p>
              Pick a win to see its steps. Do the one in front of you, then tap Done. Too big? Make
              it smaller. Even one win counts as a good day.
            </p>
          </FeatureTip>

          {dailyLog.wins_completed_count >= 3 && (
            <MascotBubble
              mood="cheer"
              title="3 out of 3. You did it!"
              testId="wins-celebration"
              actions={
                <Button asChild>
                  <Link to="/profile">See my recovery trail</Link>
                </Button>
              }
            >
              <p>
                It was never about how big the goals were. Today you looked after your body, your
                work, and your heart.
              </p>
              <div className="mt-3 flex items-end gap-1">
                {PILLARS.map((pillar) => (
                  <Mascot key={pillar} pillar={pillar} mood="cheer" className="k-pop h-16 w-14" />
                ))}
              </div>
            </MascotBubble>
          )}

          <ol className="space-y-3" aria-label="Today's to-do" data-testid="wins-todo">
            {PILLARS.map((pillar) => (
              <li key={pillar}>
                <WinRow
                  pillar={pillar}
                  item={dailyLog.wins_data[pillar]}
                  selected={selected === pillar}
                  next={pillar === nextUp}
                  onSelect={handleSelect}
                />
              </li>
            ))}
          </ol>
        </div>

        <div
          ref={detailRef}
          className={`scroll-mt-4 xl:sticky xl:top-8 ${mobileOpen ? '' : 'hidden xl:block'}`}
          data-testid="wins-detail"
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="mb-2 flex min-h-11 items-center gap-1.5 text-sm font-bold text-ink-soft xl:hidden"
            data-testid="wins-back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Today's wins
          </button>
          {detail}
        </div>
      </div>
    </div>
  );
}
