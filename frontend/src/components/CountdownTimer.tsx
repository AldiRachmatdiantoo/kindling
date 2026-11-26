import { CheckCircle2, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatSecondsMMSS } from '../utils/date';

export interface CountdownTimerProps {
  durationSeconds: number;
  title?: string;
  subtitle?: string;
  onComplete?: () => void;
  testIdPrefix?: string;
  /** Stacks the display above the controls for narrow containers such as a win card. */
  compact?: boolean;
}

export function CountdownTimer({
  durationSeconds,
  title,
  subtitle,
  onComplete,
  testIdPrefix = 'countdown',
  compact = false,
}: CountdownTimerProps) {
  const safeDuration = Math.max(1, Math.floor(durationSeconds));
  const [remaining, setRemaining] = useState(safeDuration);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setRemaining(Math.max(1, Math.floor(durationSeconds)));
    setRunning(false);
  }, [durationSeconds]);

  useEffect(() => {
    if (!running || remaining <= 0) return;

    const timerId = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [running, remaining]);

  useEffect(() => {
    if (remaining === 0) {
      onComplete?.();
    }
  }, [remaining, onComplete]);

  const progress = Math.min(100, Math.round(((safeDuration - remaining) / safeDuration) * 100));
  const isFinished = remaining === 0;

  const handleToggle = () => {
    if (isFinished) {
      setRemaining(safeDuration);
      setRunning(true);
      return;
    }
    setRunning((prev) => !prev);
  };

  const handleReset = () => {
    setRunning(false);
    setRemaining(safeDuration);
  };

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
              <CheckCircle2 className="h-4 w-4" />
              Sesi selesai! Kerja bagus memberi ruang untuk dirimu.
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-soft">
              {running ? 'Sedang berjalan...' : 'Siap dimulai kapan pun kamu nyaman.'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggle}
            data-testid={`${testIdPrefix}-toggle`}
            className="k-btn-primary px-4 py-2"
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? 'Jeda' : isFinished ? 'Ulangi' : 'Mulai'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            data-testid={`${testIdPrefix}-reset`}
            className="k-btn-secondary px-3 py-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full border-[1.5px] border-ink bg-white">
        <div
          className="h-full rounded-full bg-lime transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
