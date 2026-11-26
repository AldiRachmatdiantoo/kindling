import { CheckCircle2, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatSecondsMMSS } from '../utils/date';

export interface CountdownTimerProps {
  durationSeconds: number;
  title?: string;
  subtitle?: string;
  onComplete?: () => void;
  testIdPrefix?: string;
}

export function CountdownTimer({
  durationSeconds,
  title,
  subtitle,
  onComplete,
  testIdPrefix = 'countdown',
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
      className="rounded-2xl border border-stone-200 bg-stone-50/80 p-5"
      data-testid={`${testIdPrefix}-timer`}
    >
      {(title || subtitle) && (
        <div className="mb-3">
          {title && <h3 className="text-sm font-semibold text-stone-900">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-xs text-stone-600">{subtitle}</p>}
        </div>
      )}

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div>
          <div
            className="font-mono text-4xl font-bold tracking-tight text-stone-900 tabular-nums"
            data-testid={`${testIdPrefix}-display`}
          >
            {formatSecondsMMSS(remaining)}
          </div>
          {isFinished ? (
            <p
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"
              data-testid={`${testIdPrefix}-completed`}
            >
              <CheckCircle2 className="h-4 w-4" />
              Sesi selesai! Kerja bagus memberi ruang untuk dirimu.
            </p>
          ) : (
            <p className="mt-1 text-xs text-stone-500">
              {running ? 'Sedang berjalan...' : 'Siap dimulai kapan pun kamu nyaman.'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggle}
            data-testid={`${testIdPrefix}-toggle`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? 'Jeda' : isFinished ? 'Ulangi' : 'Mulai'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            data-testid={`${testIdPrefix}-reset`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-amber-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
