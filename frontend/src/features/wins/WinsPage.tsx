import {
  Briefcase,
  Check,
  Dumbbell,
  Feather,
  Heart,
  HeartHandshake,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, generateIdempotencyKey } from '../../api/client';
import { checkinApi, winsApi } from '../../api/endpoints';
import { sliceTaskSchema } from '../../api/schemas';
import type { DailyLog, Pillar } from '../../api/types';
import { CountdownTimer } from '../../components/CountdownTimer';

const PILLAR_META: Record<
  Pillar,
  { label: string; subtitle: string; icon: typeof Dumbbell; bg: string }
> = {
  physical: {
    label: 'Physical Win',
    subtitle: 'Merawat tubuh dengan lembut',
    icon: Dumbbell,
    bg: 'bg-mint',
  },
  work: {
    label: 'Work Win',
    subtitle: 'Satu langkah mikro tanpa overwhelm',
    icon: Briefcase,
    bg: 'bg-lavender',
  },
  soul: {
    label: 'Soul Win',
    subtitle: 'Menjaga ruang tenang untuk batin',
    icon: Heart,
    bg: 'bg-sky',
  },
};

export function WinsPage() {
  const navigate = useNavigate();

  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [togglingPillar, setTogglingPillar] = useState<Pillar | null>(null);
  const [recalibratingPillar, setRecalibratingPillar] = useState<Pillar | null>(null);

  const [taskInput, setTaskInput] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [slicing, setSlicing] = useState(false);

  useEffect(() => {
    let active = true;
    checkinApi
      .getToday()
      .then((log) => {
        if (!active) return;
        setDailyLog(log);
        if (log.wins_data.work.main_task) {
          setTaskInput(log.wins_data.work.main_task);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          navigate('/checkin', { replace: true });
          return;
        }
        setError('Gagal memuat 3 Daily Wins hari ini.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [navigate]);

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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memperbarui status win.');
    } finally {
      setTogglingPillar(null);
    }
  };

  const handleRecalibrate = async (pillar: Pillar) => {
    if (!dailyLog) return;
    setError(null);
    setRecalibratingPillar(pillar);

    try {
      const idempotencyKey = generateIdempotencyKey();
      const res = await winsApi.recalibrate(dailyLog.log_date, pillar, idempotencyKey);

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
                duration_seconds:
                  res.duration_seconds ?? prev.wins_data.work.duration_seconds,
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
              level: res.level,
              completed: false,
            },
          },
        };
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menurunkan skala target.');
    } finally {
      setRecalibratingPillar(null);
    }
  };

  const handleSliceTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!dailyLog) return;
    setTaskError(null);
    setError(null);

    const parsed = sliceTaskSchema.safeParse({ main_task: taskInput });
    if (!parsed.success) {
      setTaskError(parsed.error.issues[0]?.message || 'Masukkan tugas yang valid.');
      return;
    }

    setSlicing(true);
    try {
      const idempotencyKey = generateIdempotencyKey();
      const res = await winsApi.sliceTask(dailyLog.log_date, parsed.data.main_task, idempotencyKey);
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
            },
          },
        };
      });
    } catch (err) {
      setTaskError(err instanceof ApiError ? err.message : 'Gagal memecah tugas.');
    } finally {
      setSlicing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" data-testid="wins-loading">
        <div className="k-spinner" />
      </div>
    );
  }

  if (!dailyLog) {
    return (
      <div className="k-card mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-ink-soft">{error || 'Belum ada check-in hari ini.'}</p>
        <Link to="/checkin" className="k-btn-primary mt-5">
          Mulai Check-In
        </Link>
      </div>
    );
  }

  const pillars: Pillar[] = ['physical', 'work', 'soul'];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-ink-faint">
            Calibrated 3 Daily Wins · {dailyLog.log_date}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
            Kemenangan Kecil Hari Ini
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Fokus pada hari ini saja. Kalau target terasa berat, kamu selalu boleh menurunkannya.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="k-chip bg-lime px-3.5 py-1.5 text-sm" data-testid="wins-progress-badge">
            <Sparkles className="h-4 w-4" />
            {dailyLog.wins_completed_count} / 3 Selesai
          </span>
          <Link to="/cope" className="k-btn-secondary px-4 py-1.5">
            <HeartHandshake className="h-4 w-4" />
            Positive Cope
          </Link>
        </div>
      </div>

      {error && (
        <div className="k-error" data-testid="wins-error" role="alert">
          {error}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {pillars.map((pillar) => {
          const meta = PILLAR_META[pillar];
          const Icon = meta.icon;
          const item = dailyLog.wins_data[pillar];
          const isToggling = togglingPillar === pillar;
          const isRecalibrating = recalibratingPillar === pillar;
          const isMaxGentle = item.level >= 3;

          return (
            <article
              key={pillar}
              data-testid={`win-card-${pillar}`}
              className={`flex flex-col gap-4 rounded-3xl border-[1.5px] border-ink p-5 ${meta.bg}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="k-chip">
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </span>
                <span className="k-chip" data-testid={`win-level-${pillar}`}>
                  Level {item.level}
                </span>
              </div>

              <div>
                <h2
                  className={`text-xl leading-snug font-bold ${
                    item.completed ? 'text-ink-soft line-through' : 'text-ink'
                  }`}
                  data-testid={`win-title-${pillar}`}
                >
                  {item.title}
                </h2>
                <p className="mt-1 text-xs text-ink-soft">{meta.subtitle}</p>
              </div>

              {pillar === 'work' && (
                <div className="space-y-3 rounded-2xl border-[1.5px] border-ink bg-white p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                    <Scissors className="h-3.5 w-3.5" />
                    AI Task Slicer (5–10 menit)
                  </div>

                  <form onSubmit={handleSliceTask} className="flex gap-2" data-testid="slice-task-form">
                    <input
                      type="text"
                      maxLength={300}
                      value={taskInput}
                      onChange={(e) => setTaskInput(e.target.value)}
                      data-testid="slice-task-input"
                      aria-label="Tugas yang ingin dipecah"
                      placeholder="1 tugas yang bikin berat..."
                      className="k-input min-w-0 flex-1 rounded-full px-3.5 py-2 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={slicing}
                      data-testid="slice-task-submit"
                      className="shrink-0 rounded-full border-[1.5px] border-ink bg-lime px-3.5 py-2 text-xs font-bold text-ink transition-colors hover:bg-lime-dark disabled:opacity-60"
                    >
                      {slicing ? 'Memecah...' : 'Pecah'}
                    </button>
                  </form>
                  {taskError && <p className="text-xs font-medium text-peach-strong">{taskError}</p>}

                  {dailyLog.wins_data.work.micro_step && (
                    <div className="space-y-3" data-testid="work-micro-step-box">
                      <div className="rounded-xl bg-lavender p-3">
                        <span className="block text-[11px] font-bold text-lavender-strong">
                          Langkah Mikro Sekarang
                        </span>
                        <p
                          className="mt-1 text-xs leading-relaxed font-medium text-ink"
                          data-testid="work-micro-step"
                        >
                          {dailyLog.wins_data.work.micro_step}
                        </p>
                      </div>

                      <CountdownTimer
                        durationSeconds={dailyLog.wins_data.work.duration_seconds ?? 300}
                        title="Focus Timer"
                        testIdPrefix="focus"
                        compact
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="mt-auto space-y-2 pt-1">
                <button
                  type="button"
                  disabled={isToggling}
                  onClick={() => handleToggle(pillar)}
                  data-testid={`win-toggle-${pillar}`}
                  aria-pressed={item.completed}
                  className={`flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-ink px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60 ${
                    item.completed
                      ? 'bg-ink text-white hover:bg-ink/85'
                      : 'bg-white text-ink hover:bg-lime'
                  }`}
                >
                  <Check className="h-4 w-4" />
                  {isToggling ? 'Menyimpan...' : item.completed ? 'Selesai (Tandai Belum)' : 'Tandai Selesai'}
                </button>

                {isMaxGentle ? (
                  <div
                    className="flex items-start gap-2 rounded-2xl bg-white/70 px-3.5 py-2.5 text-xs leading-relaxed text-ink"
                    data-testid={`rest-message-${pillar}`}
                  >
                    <Feather className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Istirahat juga merupakan pilihan yang sah. Tidak apa-apa berhenti di sini
                      hari ini.
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isRecalibrating}
                    onClick={() => handleRecalibrate(pillar)}
                    data-testid={`recalibrate-${pillar}`}
                    className="w-full rounded-full px-3 py-1.5 text-xs font-semibold text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-60"
                  >
                    {isRecalibrating ? 'Menyesuaikan target...' : 'Masih Terlalu Berat'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
