import { Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, generateIdempotencyKey } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import { checkinSchema } from '../../api/schemas';
import type { CheckinAnswers } from '../../api/types';
import { DisclaimerBanner } from '../../components/DisclaimerBanner';
import { getTodayInTimezone } from '../../utils/date';
import { useAuth } from '../auth/AuthContext';
import { CHECKIN_QUESTIONS, DEMO_PRESETS, LIKERT_LABELS, type DemoPreset } from './constants';

const INITIAL_ANSWERS: Partial<CheckinAnswers> = {};

export function CheckinPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [checkingExisting, setCheckingExisting] = useState(true);
  const [answers, setAnswers] = useState<Partial<CheckinAnswers>>(INITIAL_ANSWERS);
  const [brainDump, setBrainDump] = useState('');
  const [funCopeInput, setFunCopeInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    checkinApi
      .getToday()
      .then(() => {
        if (active) {
          navigate('/wins', { replace: true });
        }
      })
      .catch((err) => {
        if (!active) return;
        // 404 means user has not checked in today yet -> show form
        if (err instanceof ApiError && err.status === 404) {
          setCheckingExisting(false);
          return;
        }
        setCheckingExisting(false);
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  const applyPreset = (preset: DemoPreset) => {
    setAnswers({ ...preset.answers });
    setBrainDump(preset.brain_dump);
    setFunCopeInput(preset.fun_cope_input);
    setFormError(null);
  };

  const handleSelectAnswer = (key: keyof CheckinAnswers, value: number) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const logDate = getTodayInTimezone(user?.timezone || 'Asia/Jakarta');
    const parsed = checkinSchema.safeParse({
      log_date: logDate,
      answers,
      brain_dump: brainDump,
      fun_cope_input: funCopeInput,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setFormError(
        firstIssue?.path[0] === 'answers'
          ? 'Mohon lengkapi seluruh 9 butir check-in terlebih dahulu.'
          : firstIssue?.message || 'Periksa kembali isian form check-in.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = generateIdempotencyKey();
      const log = await checkinApi.submit(parsed.data, idempotencyKey);
      navigate('/cope', { state: { dailyLog: log }, replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'CHECKIN_LOCKED') {
          navigate('/wins', { replace: true });
          return;
        }
        setFormError(err.message);
      } else {
        setFormError('Gagal mengirim check-in. Coba lagi sebentar.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingExisting) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" data-testid="checkin-loading">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-stone-500">Memeriksa check-in hari ini...</p>
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-3 py-1 text-xs font-medium text-amber-800">
          <Sparkles className="h-3.5 w-3.5" />
          Kalibrasi Energi Harian
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Bagaimana kondisimu hari ini?
        </h1>
        <p className="max-w-2xl text-sm text-stone-600">
          Tidak perlu memaksakan target besar. Jawab sejujurnya agar Kindling bisa menyesuaikan
          pemulihan dan 3 kemenangan kecil sesuai energimu hari ini.
        </p>
      </div>

      <DisclaimerBanner />

      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-950">Demo Presets (Isi Otomatis)</p>
              <p className="text-xs text-amber-800/90">
                Isi form secara instan untuk simulasi. Kamu tetap menekan tombol Kirim Check-In.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {DEMO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                data-testid={preset.id === 'preset-a' ? 'preset-a-button' : 'preset-b-button'}
                title={preset.description}
                className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 shadow-2xs transition-colors hover:bg-amber-100"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6" data-testid="checkin-form" noValidate>
        {formError && (
          <div
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            data-testid="checkin-error"
            role="alert"
          >
            {formError}
          </div>
        )}

        <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-stone-900">
                Bagian 1 — 9 Butir Kondisi Diri
              </h2>
              <p className="text-xs text-stone-500">
                1 = Tidak sama sekali · 2 = Sedikit · 3 = Cukup · 4 = Sangat
              </p>
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
              {answeredCount} / 9 terjawab
            </span>
          </div>

          <div className="divide-y divide-stone-100">
            {CHECKIN_QUESTIONS.map((q, index) => {
              const selected = answers[q.key];
              return (
                <fieldset key={q.key} className="py-4 first:pt-2 last:pb-0">
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                      {q.dimension}
                    </span>
                    <legend className="text-sm font-medium text-stone-900">
                      {index + 1}. {q.text}
                    </legend>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {LIKERT_LABELS.map(({ value, label }) => {
                      const isChecked = selected === value;
                      return (
                        <label
                          key={value}
                          data-testid={`answer-${q.key}-${value}`}
                          className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-center text-xs font-medium transition-all ${
                            isChecked
                              ? 'border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-500'
                              : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.key}
                            value={value}
                            checked={isChecked}
                            onChange={() => handleSelectAnswer(q.key, value)}
                            className="sr-only"
                          />
                          <span className="font-semibold">{value}</span>
                          <span className="text-[11px] opacity-85">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs sm:p-6">
          <h2 className="text-base font-semibold text-stone-900">
            Bagian 2 — Ruang Lega & Positive Cope
          </h2>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="brain-dump" className="text-sm font-medium text-stone-800">
                Brain Dump <span className="font-normal text-stone-400">(opsional)</span>
              </label>
              <span className="text-xs text-stone-400">{brainDump.length} / 2000</span>
            </div>
            <textarea
              id="brain-dump"
              rows={4}
              maxLength={2000}
              value={brainDump}
              onChange={(e) => setBrainDump(e.target.value)}
              data-testid="checkin-brain-dump"
              placeholder="Tumpahkan apa saja yang sedang mengganjal pikiranmu hari ini..."
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="fun-cope-input" className="text-sm font-medium text-stone-800">
                What fun thing do you always want to do when everything feels tired?
              </label>
              <span className="text-xs text-stone-400">{funCopeInput.length} / 200</span>
            </div>
            <input
              id="fun-cope-input"
              type="text"
              maxLength={200}
              value={funCopeInput}
              onChange={(e) => setFunCopeInput(e.target.value)}
              data-testid="checkin-fun-cope"
              placeholder="Contoh: Rebahan sambil dengerin lagu favorit, main gitar 10 menit..."
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <p className="mt-1 text-xs text-stone-500">
              Having a coping mechanism is not a bad thing — kami akan mengubahnya menjadi 3 opsi
              pemulihan yang bisa kamu pilih sendiri.
            </p>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            data-testid="checkin-submit"
            className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Mengkalibrasi hari ini...' : 'Kirim Check-In & Kalibrasi'}
          </button>
        </div>
      </form>
    </div>
  );
}
