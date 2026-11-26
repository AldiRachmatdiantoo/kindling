import { HeartHandshake, Trophy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, generateIdempotencyKey } from '../../api/client';
import { checkinApi, winsApi } from '../../api/endpoints';
import type { DailyLog, Pillar } from '../../api/types';
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
import { WinCard } from './WinCard';
import { WorkTaskSlicer } from './WorkTaskSlicer';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

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

  const [togglingPillars, setTogglingPillars] = useState<Set<Pillar>>(() => new Set());
  const [recalibratingPillar, setRecalibratingPillar] = useState<Pillar | null>(null);

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
        setRecoverySkipped(user ? isRecoverySkipped(user.id, log.log_date) : false);
        setOpenDetails(
          initialOpenDetails(user?.id, log.log_date, log.wins_data.work.steps_done ?? 0),
        );
        reportLog(log);
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

  const handleToggleDetails = useCallback((pillar: Pillar) => {
    setOpenDetails((prev) => ({ ...prev, [pillar]: !prev[pillar] }));
  }, []);

  const handleToggle = useCallback(async (pillar: Pillar) => {
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
      setTogglingPillars((prev) => {
        const next = new Set(prev);
        next.delete(pillar);
        return next;
      });
    }
  }, []);

  const handleWinWorkHere = useCallback(() => {
    void handleToggle('work');
  }, [handleToggle]);

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

  return (
    <div className="space-y-8">
      <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} />
      <TaskMorphOverlay morph={morph} onClose={() => setMorph(null)} />

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
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
          <Badge
            className="border-mint-strong bg-transparent px-3.5 py-1.5 text-sm text-mint-strong"
            data-testid="wins-progress-badge"
          >
            <Trophy className="h-4 w-4" aria-hidden="true" />
            {/* Re-keyed on change so the count pops when a win lands. */}
            <span key={dailyLog.wins_completed_count} className="k-pop inline-block">
              {dailyLog.wins_completed_count} / 3
            </span>
            done
          </Badge>
          <Button asChild variant="secondary">
            <Link to="/cope">
              <HeartHandshake className="h-4 w-4" aria-hidden="true" />
              Positive Cope
            </Link>
          </Button>
        </div>
      </Card>

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
            {PILLARS.map((pillar) => (
              <Mascot key={pillar} pillar={pillar} mood="cheer" className="k-pop h-16 w-14" />
            ))}
          </div>
        </MascotBubble>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {PILLARS.map((pillar) => (
          <WinCard
            key={pillar}
            pillar={pillar}
            item={dailyLog.wins_data[pillar]}
            logDate={dailyLog.log_date}
            userId={user?.id}
            isOpen={openDetails[pillar]}
            isToggling={togglingPillars.has(pillar)}
            isRecalibrating={recalibratingPillar === pillar}
            justCompleted={justCompleted === pillar}
            shrunk={shrunkPillar === pillar}
            showShrunkTip={shrunkPillar === pillar && !morph}
            previousTitle={previousTitle[pillar]}
            onToggleDetails={handleToggleDetails}
            onToggle={handleToggle}
            onRecalibrate={handleRecalibrate}
            workSlicer={
              pillar === 'work' ? (
                <WorkTaskSlicer
                  work={dailyLog.wins_data.work}
                  logDate={dailyLog.log_date}
                  userId={user?.id}
                  slicing={slicing}
                  isToggling={togglingPillars.has('work')}
                  finishedStep={finishedStep}
                  onFinishStep={setFinishedStep}
                  onSliceTask={handleSliceTask}
                  onSliceNextStep={handleSliceNextStep}
                  onWinHere={handleWinWorkHere}
                />
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
