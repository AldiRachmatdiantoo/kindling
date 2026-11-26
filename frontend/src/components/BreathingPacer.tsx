import { Pause, Play, RotateCcw, Wind } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatSecondsMMSS } from '../utils/date';

const BREATH_PHASES = [
  { name: 'Tarik Napas', duration: 4, hint: 'Tarik napas pelan lewat hidung', scale: 'scale-110 bg-sky-100 border-sky-400' },
  { name: 'Tahan', duration: 7, hint: 'Tahan dengan lembut tanpa tegang', scale: 'scale-110 bg-amber-100 border-amber-400' },
  { name: 'Hembuskan', duration: 8, hint: 'Hembuskan perlahan lewat mulut', scale: 'scale-95 bg-emerald-100 border-emerald-400' },
] as const;

const CYCLE_TOTAL = 19; // 4 + 7 + 8 seconds

export interface BreathingPacerProps {
  durationSeconds: number;
  guidance?: string;
}

export function getBreathingPhase(elapsedSeconds: number) {
  const pos = elapsedSeconds % CYCLE_TOTAL;
  if (pos < 4) {
    return { phase: BREATH_PHASES[0], phaseRemaining: 4 - pos };
  }
  if (pos < 11) {
    return { phase: BREATH_PHASES[1], phaseRemaining: 11 - pos };
  }
  return { phase: BREATH_PHASES[2], phaseRemaining: 19 - pos };
}

export function BreathingPacer({ durationSeconds, guidance }: BreathingPacerProps) {
  const safeDuration = Math.max(19, Math.floor(durationSeconds));
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setElapsed(0);
    setRunning(false);
  }, [durationSeconds]);

  useEffect(() => {
    if (!running || elapsed >= safeDuration) return;

    const timerId = window.setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= safeDuration) {
          setRunning(false);
          return safeDuration;
        }
        return prev + 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [running, elapsed, safeDuration]);

  const remaining = Math.max(0, safeDuration - elapsed);
  const isFinished = remaining === 0;
  const { phase, phaseRemaining } = getBreathingPhase(elapsed);

  const handleReset = () => {
    setRunning(false);
    setElapsed(0);
  };

  return (
    <div
      className="rounded-2xl border border-sky-200 bg-sky-50/50 p-6"
      data-testid="breathing-pacer"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sky-900">
          <Wind className="h-5 w-5 text-sky-600" />
          <h3 className="text-base font-semibold">Breathing Pacer (4-7-8)</h3>
        </div>
        <span className="font-mono text-sm font-semibold text-sky-800" data-testid="breathing-remaining">
          {formatSecondsMMSS(remaining)}
        </span>
      </div>

      {guidance && <p className="mb-5 text-xs text-stone-600">{guidance}</p>}

      <div className="flex flex-col items-center py-4">
        <div
          className={`flex h-40 w-40 flex-col items-center justify-center rounded-full border-2 transition-all duration-700 ${
            running ? phase.scale : 'scale-100 border-sky-200 bg-white'
          }`}
        >
          <span className="text-lg font-bold text-stone-900" data-testid="breathing-phase">
            {isFinished ? 'Selesai' : running ? phase.name : 'Siap'}
          </span>
          {!isFinished && (
            <span className="mt-1 font-mono text-2xl font-semibold text-stone-700">
              {running ? `${phaseRemaining}d` : '4-7-8'}
            </span>
          )}
        </div>
        <p className="mt-4 text-center text-sm text-stone-600">
          {isFinished
            ? 'Sesi pernapasan selesai. Rasakan bahumu sedikit lebih turun.'
            : running
              ? phase.hint
              : 'Tekan Mulai untuk mengikuti ritme 4 detik tarik, 7 detik tahan, 8 detik hembuskan.'}
        </p>
      </div>

      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (isFinished) {
              setElapsed(0);
              setRunning(true);
            } else {
              setRunning((r) => !r);
            }
          }}
          data-testid="breathing-toggle"
          className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? 'Jeda' : isFinished ? 'Ulangi' : 'Mulai'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          data-testid="breathing-reset"
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>
    </div>
  );
}
