import { ArrowRight, CheckCircle2, Clock, HeartHandshake, PenLine, Timer, Wind } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import type { CalibrationTier, CopeOption, DailyLog } from '../../api/types';
import { BreathingPacer } from '../../components/BreathingPacer';
import { CountdownTimer } from '../../components/CountdownTimer';
import { DisclaimerBanner } from '../../components/DisclaimerBanner';
import { GuidedBrainDump } from '../../components/GuidedBrainDump';
import { SafetyBanner } from '../../components/SafetyBanner';

const TIER_META: Record<CalibrationTier, { label: string; badgeClass: string; desc: string }> = {
  gentle: {
    label: 'Gentle Mode',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    desc: 'Target diperkecil semaksimal mungkin agar sistem sarafmu bisa pulih.',
  },
  balanced: {
    label: 'Balanced Mode',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    desc: 'Target ringan-sedang untuk menjaga ritme tanpa memicu kelelahan.',
  },
  standard: {
    label: 'Standard Mode',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    desc: 'Energimu cukup stabil untuk melangkah dengan target harian normal.',
  },
};

const TOOL_ICON = {
  breathing: Wind,
  timer: Timer,
  brain_dump: PenLine,
} as const;

export function CopePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialLog = (location.state as { dailyLog?: DailyLog } | null)?.dailyLog ?? null;

  const [dailyLog, setDailyLog] = useState<DailyLog | null>(initialLog);
  const [loading, setLoading] = useState(!initialLog);
  const [activeOption, setActiveOption] = useState<CopeOption | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dailyLog) {
      if (dailyLog.positive_cope_chosen && !activeOption) {
        const matched = dailyLog.cope_options.find((c) => c.title === dailyLog.positive_cope_chosen);
        if (matched) setActiveOption(matched);
      }
      return;
    }

    let active = true;
    checkinApi
      .getToday()
      .then((log) => {
        if (!active) return;
        setDailyLog(log);
        if (log.positive_cope_chosen) {
          const matched = log.cope_options.find((c) => c.title === log.positive_cope_chosen);
          if (matched) setActiveOption(matched);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          navigate('/checkin', { replace: true });
          return;
        }
        setError('Gagal memuat hasil check-in hari ini.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dailyLog, activeOption, navigate]);

  const handleChooseCope = async (option: CopeOption) => {
    if (!dailyLog) return;
    setError(null);
    setSavingId(option.id);
    try {
      const res = await checkinApi.chooseCope(dailyLog.log_date, option.id);
      setDailyLog((prev) =>
        prev ? { ...prev, positive_cope_chosen: res.positive_cope_chosen } : prev
      );
      setActiveOption(option);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan pilihan cope.');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" data-testid="cope-loading">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (!dailyLog) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <p className="text-sm text-stone-600">{error || 'Belum ada check-in untuk hari ini.'}</p>
        <Link
          to="/checkin"
          className="mt-4 inline-flex rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Mulai Check-In
        </Link>
      </div>
    );
  }

  const tierInfo = TIER_META[dailyLog.calibration_tier];
  const scoreCards = [
    {
      key: 'physical_exhaustion',
      label: 'Physical Exhaustion',
      value: dailyLog.scores.physical_exhaustion,
      hint: 'Makin tinggi = makin lelah',
      barColor: 'bg-rose-500',
    },
    {
      key: 'work_exhaustion',
      label: 'Work Exhaustion',
      value: dailyLog.scores.work_exhaustion,
      hint: 'Makin tinggi = makin terkuras',
      barColor: 'bg-amber-500',
    },
    {
      key: 'disengagement',
      label: 'Disengagement',
      value: dailyLog.scores.disengagement,
      hint: 'Makin tinggi = makin berjarak',
      barColor: 'bg-violet-500',
    },
    {
      key: 'soul_wellbeing',
      label: 'Soul Well-Being',
      value: dailyLog.scores.soul_wellbeing,
      hint: 'Makin tinggi = makin baik',
      barColor: 'bg-emerald-500',
    },
  ];

  return (
    <div className="space-y-6">
      {dailyLog.safety_flag && <SafetyBanner />}

      <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
              Hasil Kalibrasi · {dailyLog.log_date}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">
              Peta Energimu Hari Ini
            </h1>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-3.5 py-1 text-xs font-semibold ${tierInfo.badgeClass}`}
            data-testid="calibration-tier-badge"
          >
            {tierInfo.label}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-stone-700" data-testid="diagnostic-summary">
          {dailyLog.diagnostic_summary}
        </p>
        <p className="text-xs text-stone-500">{tierInfo.desc}</p>

        <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          {scoreCards.map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-4"
              data-testid={`score-${item.key}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-stone-600">{item.label}</span>
                <span className="text-xl font-bold text-stone-900">{item.value}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                <div
                  className={`h-full rounded-full ${item.barColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, item.value))}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-stone-500">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <DisclaimerBanner />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700">
              <HeartHandshake className="h-4 w-4" />
              Choose Your Own Positive Cope
            </div>
            <h2 className="mt-0.5 text-xl font-bold text-stone-900">
              Pilih 1 Momen Pemulihan Sebelum Mulai
            </h2>
            <p className="text-sm text-stone-600">
              Pulihkan sistem sarafmu dulu — atau langsung lanjut ke 3 Daily Wins jika sudah siap.
            </p>
          </div>
          <Link
            to="/wins"
            data-testid="skip-to-wins"
            className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-800"
          >
            Lanjut ke Wins
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {dailyLog.cope_options.map((option) => {
            const Icon = TOOL_ICON[option.tool_type];
            const isSelected =
              activeOption?.id === option.id || dailyLog.positive_cope_chosen === option.title;
            const minutes = Math.max(1, Math.round(option.duration_seconds / 60));

            return (
              <button
                key={option.id}
                type="button"
                disabled={savingId !== null}
                onClick={() => handleChooseCope(option)}
                data-testid={`cope-card-${option.id}`}
                className={`flex flex-col justify-between rounded-2xl border p-5 text-left transition-all ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/70 ring-2 ring-sky-500/20'
                    : 'border-stone-200 bg-white hover:border-amber-300 hover:shadow-xs'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-600">
                      <Icon className="h-3.5 w-3.5" />
                      {option.brief_cope_category.replace(/_/g, ' ')}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                      <Clock className="h-3.5 w-3.5" />
                      {minutes} mnt
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-stone-900">{option.title}</h3>
                  <p className="text-xs leading-relaxed text-stone-600">{option.guidance}</p>
                </div>

                <div className="mt-4 flex items-center justify-between pt-2 text-xs font-semibold">
                  {savingId === option.id ? (
                    <span className="text-amber-700">Menyimpan...</span>
                  ) : isSelected ? (
                    <span className="inline-flex items-center gap-1 text-sky-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Dipilih hari ini
                    </span>
                  ) : (
                    <span className="text-amber-700">Pilih &amp; jalankan →</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {activeOption && (
          <div className="pt-2" data-testid="active-cope-tool">
            {activeOption.tool_type === 'breathing' && (
              <BreathingPacer
                durationSeconds={activeOption.duration_seconds}
                guidance={activeOption.guidance}
              />
            )}
            {activeOption.tool_type === 'timer' && (
              <CountdownTimer
                durationSeconds={activeOption.duration_seconds}
                title={activeOption.title}
                subtitle={activeOption.guidance}
                testIdPrefix="cope-activity"
              />
            )}
            {activeOption.tool_type === 'brain_dump' && (
              <GuidedBrainDump
                durationSeconds={activeOption.duration_seconds}
                guidance={activeOption.guidance}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
