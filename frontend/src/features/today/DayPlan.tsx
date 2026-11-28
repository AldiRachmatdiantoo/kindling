import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

export type DayStep = 'cope' | 'wins';

export interface DayPlanProps {
  /** The page this strip sits on: that step is marked "You are here". */
  current: DayStep;
  copeDone: boolean;
  copeSkipped?: boolean;
  winsDone: number;
}

interface Step {
  key: 'checkin' | DayStep;
  label: string;
  status: string;
  done: boolean;
  to?: string;
}

/**
 * The whole day in three steps: check in, one recovery moment, three small wins. It sits at
 * the top of the after-check-in pages so "what do I do now?" always has an answer on screen.
 */
export function DayPlan({ current, copeDone, copeSkipped = false, winsDone }: DayPlanProps) {
  const steps: Step[] = [
    { key: 'checkin', label: 'Check in', status: 'Done', done: true },
    {
      key: 'cope',
      label: 'Recovery moment',
      status: copeDone ? 'Done' : copeSkipped ? 'Skipped' : 'Not yet',
      done: copeDone,
      to: '/cope',
    },
    {
      key: 'wins',
      label: '3 small wins',
      status: `${winsDone} of 3 done`,
      done: winsDone >= 3,
      to: '/wins',
    },
  ];

  return (
    <nav aria-label="Your day" data-testid="day-plan">
      <ol className="grid grid-cols-3 gap-2">
        {steps.map((step, i) => {
          const here = step.key === current;
          const body = (
            <>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done
                    ? 'bg-mint-strong text-surface'
                    : here
                      ? 'bg-ink text-surface'
                      : 'border-[1.5px] border-line-strong text-ink-soft'
                }`}
                aria-hidden="true"
              >
                {step.done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-[13px] leading-tight font-bold ${
                    here ? 'text-ink' : 'text-ink-soft'
                  }`}
                >
                  {step.label}
                </span>
                <span className="block text-[11px] leading-tight text-ink-faint">
                  {here ? 'You are here' : step.status}
                </span>
              </span>
            </>
          );
          const cls = `flex h-full items-center gap-2 rounded-2xl border px-2.5 py-2 sm:px-3 ${
            here ? 'border-line-strong bg-surface' : 'border-transparent'
          }`;
          return (
            <li key={step.key} data-testid={`day-step-${step.key}`} data-done={step.done}>
              {step.to && !here ? (
                <Link to={step.to} className={`${cls} k-press hover:bg-surface`}>
                  {body}
                </Link>
              ) : (
                <div className={cls} aria-current={here ? 'step' : undefined}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
