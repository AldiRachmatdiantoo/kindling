import { CheckCircle2, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { useClockTimer } from './useClockTimer';
import { formatSecondsMMSS } from '../utils/date';
import { Button } from '@/components/watermelon-ui/button';

export interface CountdownTimerProps {
  durationSeconds: number;
  title?: string;
  subtitle?: string;
  onComplete?: () => void;
  testIdPrefix?: string;
  /** Stacks the display above the controls for narrow containers such as a win card. */
  compact?: boolean;
  /** Keeps the timer running across page changes. Make it unique per activity and day. */
  persistKey?: string;
}

export function CountdownTimer({
  durationSeconds,
  title,
  subtitle,
  onComplete,
  testIdPrefix = 'countdown',
  compact = false,
  persistKey,
}: CountdownTimerProps) {
  const safeDuration = Math.max(1, Math.floor(durationSeconds));
  const { elapsed, running, start, pause, reset } = useClockTimer(safeDuration, persistKey);
  const remaining = safeDuration - elapsed;

  useEffect(() => {
    if (remaining === 0) {
      onComplete?.();
    }
  }, [remaining, onComplete]);

  const progress = Math.min(100, Math.round((elapsed / safeDuration) * 100));
  const isFinished = remaining === 0;

  const handleToggle = () => (running ? pause() : start());
  const handleReset = reset;

  return (
    <div
      className={`rounded-2xl border-[1.5px] border-ink bg-cream ${compact ? 'p-3.5' : 'p-5'}`}
      data-testid={`${testIdPrefix}-timer`}
    >
      {(title || subtitle) && (
        <div className="mb-3">
          {title && <h3 className="text-sm font-bold text-ink">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
        </div>
      )}

      <div
        className={`flex flex-col items-center gap-3 ${compact ? '' : 'sm:flex-row sm:justify-between'}`}
      >
        <div>
          <div
            className={`font-mono font-bold tracking-tight text-ink tabular-nums ${compact ? 'text-3xl' : 'text-4xl'}`}
            data-testid={`${testIdPrefix}-display`}
          >
            {formatSecondsMMSS(remaining)}
          </div>
          {isFinished ? (
            <p
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-mint-strong"
              data-testid={`${testIdPrefix}-completed`}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Time's up. Nice work making room for yourself.
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-soft">
              {running ? 'Running...' : 'Start whenever you feel ready.'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleToggle} data-testid={`${testIdPrefix}-toggle`}>
            {running ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            {running ? 'Pause' : isFinished ? 'Again' : 'Start'}
          </Button>
          <Button onClick={handleReset} data-testid={`${testIdPrefix}-reset`} variant="secondary">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
        </div>
      </div>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full border-[1.5px] border-ink bg-surface">
        <div
          className="h-full rounded-full bg-lime transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
