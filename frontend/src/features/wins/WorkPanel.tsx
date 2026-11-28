import { Check, Flag, RefreshCw } from 'lucide-react';
import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { sliceTaskSchema } from '../../api/schemas';
import type { Pillar, WorkWinItem } from '../../api/types';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Mascot, PILLAR_MASCOT } from '../../components/Mascot';
import { MascotBubble } from '../../components/MascotBubble';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/watermelon-ui/button';
import { PILLAR_META, timerKey } from './constants';

export interface WorkPanelProps {
  work: WorkWinItem;
  logDate: string;
  userId: string | undefined;
  slicing: boolean;
  isToggling: boolean;
  isRecalibrating: boolean;
  /** The micro-step the user marked done; the "keep going?" choice shows for it. */
  finishedStep: string | null;
  previousTitle?: string;
  onFinishStep: (step: string) => void;
  onSliceTask: (mainTask: string) => Promise<string | null>;
  onSliceNextStep: () => Promise<string | null>;
  onToggle: (pillar: Pillar) => void;
  onRecalibrate: (pillar: Pillar) => void;
}

type NodeState = 'done' | 'now' | 'next';

/** One stop on the road: a node on the line, then its text or the current-step card. */
function Stop({
  state,
  goal = false,
  last = false,
  label,
  children,
  testId,
}: {
  state: NodeState;
  goal?: boolean;
  last?: boolean;
  label: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <li className="relative flex gap-3.5 pb-4" data-state={state} data-testid={testId}>
      {!last && (
        <span
          className={`absolute top-9 bottom-0 left-[15px] w-[3px] rounded-full ${
            state === 'done' ? 'bg-sun-strong opacity-45' : 'bg-line'
          }`}
          aria-hidden="true"
        />
      )}
      <span
        className={`relative z-10 flex h-[33px] w-[33px] shrink-0 items-center justify-center text-[13px] font-extrabold ${
          goal ? 'rounded-[10px]' : 'rounded-full'
        } ${
          state === 'done'
            ? 'bg-sun-strong text-surface'
            : state === 'now'
              ? 'border-[3px] border-sun-strong bg-sun text-sun-strong'
              : 'border-[2.5px] border-dashed border-line-strong bg-surface text-ink-faint'
        }`}
        aria-hidden="true"
      >
        {state === 'done' ? (
          <Check className="h-4 w-4" strokeWidth={3} />
        ) : goal ? (
          <Flag className="h-4 w-4" />
        ) : (
          label
        )}
      </span>
      {children}
    </li>
  );
}

/**
 * The work win in the same shape as the physical and soul roadmaps: name the task, then one
 * tiny sliced step at a time. The first tiny step done is today's win; more are a bonus.
 * Work changes every day, so its steps come from the slicer one by one, not a fixed list.
 */
export function WorkPanel({
  work,
  logDate,
  userId,
  slicing,
  isToggling,
  isRecalibrating,
  finishedStep,
  previousTitle,
  onFinishStep,
  onSliceTask,
  onSliceNextStep,
  onToggle,
  onRecalibrate,
}: WorkPanelProps) {
  const [taskInput, setTaskInput] = useState(work.main_task ?? '');
  const [error, setError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [stopped, setStopped] = useState(false);
  // Renaming the task brings its input back; a new task starts a fresh first tiny step.
  const [editingTask, setEditingTask] = useState(false);

  const stepsDone = work.steps_done ?? 0;
  const micro = work.micro_step;
  const finished = Boolean(micro) && finishedStep === micro;
  // Steps finished so far: the earlier ones, plus the current one once marked done.
  const doneCount = stepsDone + (finished ? 1 : 0);
  const winIn = work.completed;

  const submitTask = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = sliceTaskSchema.safeParse({ main_task: taskInput });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Type a task first.');
      return;
    }
    const err = await onSliceTask(parsed.data.main_task);
    if (err) setError(err);
    else setEditingTask(false);
  };

  const markStepDone = () => {
    if (!micro) return;
    onFinishStep(micro);
    setStopped(false);
    // The first tiny step is the floor: finishing it is today's work win.
    if (!work.completed) onToggle('work');
  };

  const nextStep = async () => {
    setError(null);
    setStopped(false);
    const err = await onSliceNextStep();
    if (err) setError(err);
  };

  // The road, in order: the task, each tiny step, then the next one on offer. The floor line
  // sits after the first tiny step, because finishing it is today's win.
  const stops: ReactNode[] = [];
  stops.push(
    work.main_task && !editingTask ? (
      <Stop state="done" label="1" testId="work-step-task">
        <span className="min-w-0 flex-1 pt-1.5 text-[15px] text-ink-soft">
          <span className="block text-xs font-bold text-ink-faint">Your task</span>
          {work.main_task}
          <button
            type="button"
            onClick={() => {
              setTaskInput(work.main_task ?? '');
              setEditingTask(true);
            }}
            className="ml-2 text-xs font-bold text-primary underline underline-offset-4"
            data-testid="work-change-task"
          >
            Change
          </button>
        </span>
      </Stop>
    ) : (
      <Stop state="now" label="1" testId="work-step-task">
        <div className="min-w-0 flex-1 rounded-[22px] border-[1.5px] border-sun-strong bg-sun p-4">
          <p className="text-xs font-bold text-sun-strong">Right now · Step 1</p>
          <p className="mt-1.5 mb-3 font-serif text-xl leading-snug font-bold text-ink">
            What's the one task on your mind?
          </p>
          <form onSubmit={submitTask} className="space-y-2.5" data-testid="slice-task-form">
            <Input
              type="text"
              maxLength={300}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              data-testid="slice-task-input"
              aria-label="Task to break down"
              placeholder="e.g. write the report intro"
              className="min-h-12 rounded-full bg-surface px-4 text-sm"
            />
            <button
              type="submit"
              disabled={slicing}
              className="k-press min-h-13 w-full rounded-full bg-sun-strong text-base font-extrabold text-surface disabled:opacity-60"
              data-testid="slice-task-submit"
            >
              {slicing ? 'Slicing...' : 'Slice it into a tiny step'}
            </button>
          </form>
        </div>
      </Stop>
    ),
  );
  // Tiny steps already finished; only the current one's text is kept by the server.
  for (let i = 0; i < doneCount; i++) {
    stops.push(
      <Stop state="done" label={i + 2} testId={`work-step-done-${i}`}>
        <span className="min-w-0 flex-1 pt-1.5 text-[15px] text-ink-soft line-through decoration-ink/25">
          {finished && i === doneCount - 1 && micro ? micro : `Tiny step ${i + 1}`}
        </span>
      </Stop>,
    );
  }
  if (micro && !finished) {
    stops.push(
      <Stop state="now" label={stepsDone + 2} testId="work-micro-step-box">
        <div className="min-w-0 flex-1 rounded-[22px] border-[1.5px] border-sun-strong bg-sun p-4">
          <p className="text-xs font-bold text-sun-strong" data-testid="work-step-number">
            Right now · Tiny step {stepsDone + 1}
            {winIn && stepsDone > 0 ? ' · Bonus' : ''}
          </p>
          <p
            className="mt-1.5 mb-3.5 font-serif text-xl leading-snug font-bold text-ink"
            data-testid="work-micro-step"
          >
            {micro}
          </p>
          <button
            type="button"
            onClick={markStepDone}
            disabled={isToggling}
            className="k-press min-h-13 w-full rounded-full bg-sun-strong text-base font-extrabold text-surface disabled:opacity-60"
            data-testid="work-step-done"
          >
            {isToggling ? 'Saving...' : 'Done'}
          </button>
          <div className="mt-3">
            <CountdownTimer
              key={stepsDone}
              durationSeconds={work.duration_seconds ?? 300}
              title="Focus timer"
              testIdPrefix="focus"
              persistKey={userId ? timerKey(userId, logDate, 'work', stepsDone) : undefined}
              compact
            />
          </div>
        </div>
      </Stop>,
    );
  }
  stops.push(
    <Stop state="next" goal last label="">
      <span className="min-w-0 flex-1 pt-1.5 text-[15px] text-ink-faint">
        {work.main_task ? 'Next tiny step, if you want one' : 'One tiny step from your task'}
        {winIn && (
          <span className="ml-2 rounded-full border border-line px-2 py-px text-[11px] font-bold text-ink-faint">
            Bonus
          </span>
        )}
      </span>
    </Stop>,
  );
  // After the first tiny step (stop 1), or after the placeholder when there is none yet.
  const floorAfter = Math.min(1, stops.length - 1);

  return (
    <section
      className="rounded-3xl border border-line bg-surface p-5 sm:p-6"
      aria-label={`${PILLAR_META.work.label}: ${work.title}`}
      aria-busy={isRecalibrating || undefined}
      data-testid="win-card-work"
    >
      <div className="flex items-center gap-3.5">
        <Mascot pillar="work" mood={winIn ? 'cheer' : 'happy'} className="h-16 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold text-sun-strong">
            {PILLAR_MASCOT.work.name} · {PILLAR_META.work.label}
          </span>
          <h2
            className="mt-1 text-2xl leading-tight font-bold text-ink"
            data-testid="win-title-work"
          >
            {work.title}
          </h2>
          {previousTitle && work.level > 0 && (
            <p className="mt-1 text-xs text-ink-soft" data-testid="win-previous-work">
              <span className="sr-only">Was: </span>
              <s>{previousTitle}</s>
            </p>
          )}
          {work.habit && (
            <span className="mt-1 block text-xs text-ink-soft" data-testid="win-habit-work">
              From your habit: {work.habit}
            </span>
          )}
        </div>
        {work.why_this && (
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            aria-expanded={whyOpen}
            aria-controls="work-why"
            className="min-h-11 shrink-0 self-start px-1 text-sm font-bold text-primary underline underline-offset-4"
            data-testid="roadmap-why-toggle-work"
          >
            Why?
          </button>
        )}
      </div>
      {work.why_this && (
        <p
          id="work-why"
          hidden={!whyOpen}
          className="mt-3.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-sm leading-relaxed text-ink-soft"
          data-testid="win-why-work"
        >
          {work.why_this}
        </p>
      )}

      <ol className="mt-6" data-testid="work-steps">
        {stops.map((stop, i) => (
          <Fragment key={i}>
            {stop}
            {i === floorAfter && (
              <li
                className="mb-4 flex items-center gap-2.5 text-xs font-extrabold text-sun-strong"
                data-testid="roadmap-floor-work"
                data-reached={winIn}
              >
                <span
                  className="h-0.5 flex-1 border-t-2 border-dashed border-current opacity-60"
                  aria-hidden="true"
                />
                <span className={winIn ? 'rounded-full bg-sun-strong px-3 py-1 text-surface' : ''}>
                  {winIn ? "✓ Today's win is in" : "Today's win counts from here"}
                </span>
                <span
                  className="h-0.5 flex-1 border-t-2 border-dashed border-current opacity-60"
                  aria-hidden="true"
                />
              </li>
            )}
          </Fragment>
        ))}
      </ol>

      {finished && !stopped && (
        <div aria-live="polite" data-testid="work-step-choice">
          <MascotBubble
            size="sm"
            pillar="work"
            mood="cheer"
            title={winIn ? "Today's work win is in." : `Tiny step ${stepsDone + 1} done.`}
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void nextStep()}
                  disabled={slicing}
                  data-testid="work-next-step"
                >
                  {slicing ? 'Slicing...' : 'Next tiny step (bonus)'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setStopped(true)}
                  data-testid="work-stop-here"
                >
                  Stop here
                </Button>
              </div>
            }
          >
            <p>Anything more is a bonus. Keep going only if it feels okay.</p>
          </MascotBubble>
        </div>
      )}
      {finished && stopped && (
        <p
          className="rounded-2xl bg-surface-2 px-3.5 py-3 text-sm text-ink-soft"
          data-testid="work-stopped-note"
        >
          Win kept. Rest well, the rest of the task can wait.
        </p>
      )}

      {error && (
        <p className="mt-2 text-sm font-semibold text-peach-strong" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-1 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={isToggling}
            onClick={() => onToggle('work')}
            aria-pressed={work.completed}
            className="min-h-11 px-1 text-sm font-bold text-ink-soft underline underline-offset-4 disabled:opacity-60"
            data-testid="win-toggle-work"
          >
            {isToggling
              ? 'Saving...'
              : work.completed
                ? 'Done (undo)'
                : 'Already did it? Mark as done'}
          </button>
          <span className="k-chip" data-testid="win-level-work">
            Level {work.level}
          </span>
        </div>
        {!work.completed && work.level < 3 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isRecalibrating}
            onClick={() => onRecalibrate('work')}
            data-testid="recalibrate-work"
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
        {work.level >= 3 && !work.completed && (
          <p className="text-sm text-ink-soft" data-testid="rest-message-work">
            Resting is a valid choice too. It's okay to stop here for today.
          </p>
        )}
      </div>
    </section>
  );
}
