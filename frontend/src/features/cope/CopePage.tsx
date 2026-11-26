import { ArrowRight, CheckCircle2, Clock, Leaf, PenLine, Play, Timer, Wind } from 'lucide-react';
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
    badgeClass: 'bg-sky',
    desc: 'Target diperkecil semaksimal mungkin agar sistem sarafmu bisa pulih.',
  },
  balanced: {
    label: 'Balanced Mode',
    badgeClass: 'bg-lavender',
    desc: 'Target ringan-sedang untuk menjaga ritme tanpa memicu kelelahan.',
  },
  standard: {
    label: 'Standard Mode',
    badgeClass: 'bg-mint',
    desc: 'Energimu cukup stabil untuk melangkah dengan target harian normal.',
  },
};

const TOOL_ICON = {
  breathing: Wind,
  timer: Timer,
  brain_dump: PenLine,
} as const;

const COPE_CARD_BG = ['bg-mint', 'bg-lavender', 'bg-sky'];

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
        <div className="k-spinner" />
      </div>
    );
  }

  if (!dailyLog) {
    return (
      <div className="k-card mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-ink-soft">{error || 'Belum ada check-in untuk hari ini.'}</p>
        <Link to="/checkin" className="k-btn-primary mt-5">
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
      barColor: 'bg-primary',
    },
    {
      key: 'work_exhaustion',
      label: 'Work Exhaustion',
      value: dailyLog.scores.work_exhaustion,
      hint: 'Makin tinggi = makin terkuras',
      barColor: 'bg-lavender-strong',
    },
    {
      key: 'disengagement',
      label: 'Disengagement',
      value: dailyLog.scores.disengagement,
      hint: 'Makin tinggi = makin berjarak',
      barColor: 'bg-lime-dark',
    },
    {
      key: 'soul_wellbeing',
      label: 'Soul Well-Being',
      value: dailyLog.scores.soul_wellbeing,
      hint: 'Makin tinggi = makin baik',
      barColor: 'bg-mint-strong',
    },
  ];

  return (
    <div className="space-y-8">
      {dailyLog.safety_flag && <SafetyBanner />}

      <section className="k-card space-y-4 p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-faint">Hasil Kalibrasi · {dailyLog.log_date}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Peta Energimu Hari Ini</h1>
          </div>
          <span
            className={`k-chip ${tierInfo.badgeClass}`}
            data-testid="calibration-tier-badge"
          >
            <Leaf className="h-3.5 w-3.5" />
            {tierInfo.label}
          </span>
        </div>

        <p className="max-w-3xl text-sm leading-relaxed text-ink" data-testid="diagnostic-summary">
          {dailyLog.diagnostic_summary}
        </p>
        <p className="text-xs text-ink-soft">{tierInfo.desc}</p>

        <div className="grid grid-cols-2 gap-3 pt-1 lg:grid-cols-4">
          {scoreCards.map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border-[1.5px] border-ink bg-cream p-4"
              data-testid={`score-${item.key}`}
            >
              <span className="block text-xs font-semibold text-ink-soft">{item.label}</span>
              <span className="mt-1 block font-serif text-3xl font-bold text-ink">{item.value}</span>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-full rounded-full ${item.barColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, item.value))}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-faint">Choose Your Own Positive Cope</p>
            <h2 className="mt-0.5 text-2xl font-bold text-ink">Pilih 1 Momen Pemulihan</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Pulihkan sistem sarafmu dulu — atau langsung lanjut ke 3 Daily Wins jika sudah siap.
            </p>
          </div>
          <Link to="/wins" data-testid="skip-to-wins" className="k-btn-secondary">
            Lewati &amp; Lanjut ke 3 Wins
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {error && (
          <div className="k-error" role="alert">
            {error}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {dailyLog.cope_options.map((option, index) => {
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
                aria-pressed={isSelected}
                className={`flex flex-col justify-between gap-4 rounded-3xl border-[1.5px] border-ink p-5 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-wait ${
                  COPE_CARD_BG[index % COPE_CARD_BG.length]
                } ${isSelected ? 'ring-4 ring-primary/40' : ''}`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="k-chip capitalize">
                      <Icon className="h-3.5 w-3.5" />
                      {option.brief_cope_category.replace(/_/g, ' ')}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft">
                      <Clock className="h-3.5 w-3.5" />
                      {minutes} mnt
                    </span>
                  </div>
                  <h3 className="text-xl leading-snug font-bold text-ink">{option.title}</h3>
                  <p className="text-xs leading-relaxed text-ink-soft">{option.guidance}</p>
                </div>

                <div className="flex items-center justify-between text-sm font-bold">
                  {savingId === option.id ? (
                    <span className="text-ink-soft">Menyimpan...</span>
                  ) : isSelected ? (
                    <span className="inline-flex items-center gap-1.5 text-ink">
                      <CheckCircle2 className="h-4 w-4" />
                      Dipilih hari ini
                    </span>
                  ) : (
                    <span className="text-ink-soft">Pilih &amp; jalankan</span>
                  )}
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-ink bg-lime">
                    <Play className="h-4 w-4" />
                  </span>
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

      <DisclaimerBanner />
    </div>
  );
}
