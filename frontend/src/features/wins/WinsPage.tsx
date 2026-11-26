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
  { label: string; subtitle: string; icon: typeof Dumbbell; accent: string; badge: string }
> = {
  physical: {
    label: 'Physical Win',
    subtitle: 'Merawat tubuh dengan lembut',
    icon: Dumbbell,
    accent: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800',
  },
  work: {
    label: 'Work Win',
    subtitle: 'Satu langkah mikro tanpa overwhelm',
    icon: Briefcase,
    accent: 'text-amber-700 bg-amber-50 border-amber-200',
    badge: 'bg-amber-100 text-amber-800',
  },
  soul: {
    label: 'Soul Win',
    subtitle: 'Menjaga ruang tenang untuk batin',
    icon: Heart,
    accent: 'text-sky-700 bg-sky-50 border-sky-200',
    badge: 'bg-sky-100 text-sky-800',
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
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (!dailyLog) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <p className="text-sm text-stone-600">{error || 'Belum ada check-in hari ini.'}</p>
        <Link
          to="/checkin"
          className="mt-4 inline-flex rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Mulai Check-In
        </Link>
      </div>
    );
  }

  const pillars: Pillar[] = ['physical', 'work', 'soul'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-3 py-1 text-xs font-medium text-amber-800">
            <Sparkles className="h-3.5 w-3.5" />
            Calibrated 3 Daily Wins · {dailyLog.log_date}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
            Kemenangan Kecil Hari Ini
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Fokus pada hari ini saja. Kalau target terasa berat, kamu selalu boleh menurunkannya.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-center"
            data-testid="wins-progress-badge"
          >
            <span className="block text-xs text-stone-500">Selesai Hari Ini</span>
            <span className="text-xl font-bold text-stone-900">
              {dailyLog.wins_completed_count} / 3
            </span>
          </div>
          <Link
            to="/cope"
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            <HeartHandshake className="h-4 w-4 text-sky-600" />
            Positive Cope
          </Link>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          data-testid="wins-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
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
              className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-xs transition-all ${
                item.completed ? 'border-emerald-300 bg-emerald-50/30' : 'border-stone-200/80'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border ${meta.accent}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-base font-semibold text-stone-900">{meta.label}</h2>
                      <p className="text-xs text-stone-500">{meta.subtitle}</p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.badge}`}
                    data-testid={`win-level-${pillar}`}
                  >
                    Level {item.level}
                  </span>
                </div>

                <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-4">
                  <p
                    className={`text-sm font-medium leading-relaxed ${
                      item.completed ? 'text-stone-500 line-through' : 'text-stone-900'
                    }`}
                    data-testid={`win-title-${pillar}`}
                  >
                    {item.title}
                  </p>
                </div>

                {pillar === 'work' && (
                  <div className="space-y-3 rounded-xl border border-amber-200/70 bg-amber-50/40 p-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                      <Scissors className="h-3.5 w-3.5" />
                      AI Task Slicer (5–10 menit)
                    </div>

                    <form
                      onSubmit={handleSliceTask}
                      className="space-y-2"
                      data-testid="slice-task-form"
                    >
                      <input
                        type="text"
                        maxLength={300}
                        value={taskInput}
                        onChange={(e) => setTaskInput(e.target.value)}
                        data-testid="slice-task-input"
                        placeholder="Masukkan 1 tugas yang bikin berat..."
                        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                      {taskError && <p className="text-xs text-rose-600">{taskError}</p>}
                      <button
                        type="submit"
                        disabled={slicing}
                        data-testid="slice-task-submit"
                        className="w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
                      >
                        {slicing ? 'Memecah tugas...' : 'Pecah Jadi Langkah Mikro'}
                      </button>
                    </form>

                    {dailyLog.wins_data.work.micro_step && (
                      <div className="space-y-3 pt-1" data-testid="work-micro-step-box">
                        <div className="rounded-lg border border-amber-200 bg-white p-3">
                          <span className="block text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                            Langkah Mikro Sekarang
                          </span>
                          <p
                            className="mt-1 text-xs font-medium leading-relaxed text-stone-900"
                            data-testid="work-micro-step"
                          >
                            {dailyLog.wins_data.work.micro_step}
                          </p>
                        </div>

                        <CountdownTimer
                          durationSeconds={dailyLog.wins_data.work.duration_seconds ?? 300}
                          title="Focus Timer"
                          testIdPrefix="focus"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-2.5 border-t border-stone-100 pt-4">
                <button
                  type="button"
                  disabled={isToggling}
                  onClick={() => handleToggle(pillar)}
                  data-testid={`win-toggle-${pillar}`}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                    item.completed
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
                  }`}
                >
                  <Check className="h-4 w-4" />
                  {isToggling
                    ? 'Menyimpan...'
                    : item.completed
                      ? 'Selesai (Tandai Belum)'
                      : 'Tandai Selesai'}
                </button>

                {isMaxGentle ? (
                  <div
                    className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-sky-900"
                    data-testid={`rest-message-${pillar}`}
                  >
                    <Feather className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
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
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 disabled:opacity-60"
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
