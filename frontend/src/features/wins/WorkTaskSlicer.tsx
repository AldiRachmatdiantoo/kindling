import { Scissors, Trophy } from 'lucide-react';
import { memo, useCallback, useEffect, useState, type FormEvent } from 'react';
import { sliceTaskSchema } from '../../api/schemas';
import type { WorkWinItem } from '../../api/types';
import { CountdownTimer } from '../../components/CountdownTimer';
import { FeatureTip } from '../../components/FeatureTip';
import { Button } from '@/components/watermelon-ui/button';
import { timerKey } from './constants';
import { Input } from '@/components/ui/input';

export interface WorkTaskSlicerProps {
  work: WorkWinItem;
  logDate: string;
  userId: string | undefined;
  slicing: boolean;
  isToggling: boolean;
  finishedStep: string | null;
  onFinishStep: (step: string) => void;
  onSliceTask: (mainTask: string) => Promise<string | null>;
  onSliceNextStep: () => Promise<string | null>;
  onWinHere: () => void;
}

export const WorkTaskSlicer = memo(function WorkTaskSlicer({
  work,
  logDate,
  userId,
  slicing,
  isToggling,
  finishedStep,
  onFinishStep,
  onSliceTask,
  onSliceNextStep,
  onWinHere,
}: WorkTaskSlicerProps) {
  const [taskInput, setTaskInput] = useState(work.main_task ?? '');
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    if (work.main_task) {
      setTaskInput(work.main_task);
    }
  }, [work.main_task]);

  const currentMicroStep = work.micro_step ?? null;
  const handleFocusComplete = useCallback(() => {
    if (currentMicroStep) onFinishStep(currentMicroStep);
  }, [currentMicroStep, onFinishStep]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTaskError(null);

    const parsed = sliceTaskSchema.safeParse({ main_task: taskInput });
    if (!parsed.success) {
      setTaskError(parsed.error.issues[0]?.message || 'Type a task first.');
      return;
    }

    const err = await onSliceTask(parsed.data.main_task);
    if (err) {
      setTaskError(err);
    }
  };

  const handleNextStep = async () => {
    setTaskError(null);
    const err = await onSliceNextStep();
    if (err) {
      setTaskError(err);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
      <div className="flex items-center gap-1.5 text-xs font-bold text-sun-strong">
        <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
        AI Task Slicer (5–10 min)
      </div>

      <FeatureTip id="wins-slicer" title="Big task? Let's slice it" pillar="work">
        <p>
          Type the one task that feels heavy and tap Slice it. I'll turn it into a single step you
          can finish in 5 to 10 minutes.
        </p>
      </FeatureTip>

      <form onSubmit={handleSubmit} className="flex gap-2" data-testid="slice-task-form">
        <Input
          type="text"
          maxLength={300}
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          data-testid="slice-task-input"
          aria-label="Task to break down"
          placeholder="One task that feels heavy..."
          className="min-h-11 min-w-0 flex-1 rounded-full px-3.5 py-2 text-xs"
        />
        <Button type="submit" size="sm" disabled={slicing} data-testid="slice-task-submit">
          {slicing ? 'Slicing...' : 'Slice it'}
        </Button>
      </form>
      {taskError && <p className="text-xs font-medium text-peach-strong">{taskError}</p>}

      {work.micro_step && (
        <div className="space-y-3" data-testid="work-micro-step-box">
          <div className="rounded-xl bg-sun p-3">
            <span
              className="block text-[11px] font-bold text-sun-strong"
              data-testid="work-step-number"
            >
              Step {(work.steps_done ?? 0) + 1} · Your next tiny step
            </span>
            <p
              className="mt-1 text-xs leading-relaxed font-medium text-ink"
              data-testid="work-micro-step"
            >
              {work.micro_step}
            </p>
          </div>

          <FeatureTip id="wins-timer" title="Just this one step" pillar="work">
            <p>
              Press Start on the focus timer and work on only this step. When it rings, you're
              allowed to stop: win here, or slice the next step.
            </p>
          </FeatureTip>

          <CountdownTimer
            key={work.steps_done ?? 0}
            durationSeconds={work.duration_seconds ?? 300}
            title="Focus Timer"
            testIdPrefix="focus"
            persistKey={
              userId ? timerKey(userId, logDate, 'work', work.steps_done ?? 0) : undefined
            }
            onComplete={handleFocusComplete}
            compact
          />

          {work.completed ? null : finishedStep === work.micro_step ? (
            <div
              className="k-shrink-in space-y-2 rounded-xl border border-line bg-surface-2 p-3"
              data-testid="work-step-choice"
              role="status"
            >
              <p className="text-xs font-bold text-ink">
                Step {(work.steps_done ?? 0) + 1} done. Keep going, or call it a win?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={onWinHere}
                  disabled={isToggling}
                  data-testid="work-win-here"
                >
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  Win here for today
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleNextStep}
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
              onClick={() => onFinishStep(work.micro_step!)}
              className="text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-ink"
              data-testid="work-step-finished-early"
            >
              Finished this step early?
            </button>
          )}
        </div>
      )}
    </div>
  );
});
