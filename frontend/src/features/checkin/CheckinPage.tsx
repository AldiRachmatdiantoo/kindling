import { ArrowLeft, ArrowRight, Check, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, generateIdempotencyKey } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import { checkinSchema } from '../../api/schemas';
import type { CheckinAnswers } from '../../api/types';
import { DisclaimerBanner } from '../../components/DisclaimerBanner';
import { getTodayInTimezone } from '../../utils/date';
import { useAuth } from '../auth/AuthContext';
import {
  CHECKIN_QUESTIONS,
  DEMO_PRESETS,
  LIKERT_LABELS,
  type CheckinQuestion,
  type DemoPreset,
} from './constants';

const INITIAL_ANSWERS: Partial<CheckinAnswers> = {};
const TOTAL_QUESTIONS = CHECKIN_QUESTIONS.length;
const FINAL_STEP = TOTAL_QUESTIONS;

const DIMENSION_META: Record<CheckinQuestion['dimension'], { label: string; chip: string }> = {
  Physical: { label: 'Physical Energy', chip: 'bg-mint' },
  'Work Exhaustion': { label: 'Work Exhaustion', chip: 'bg-lavender' },
  Disengagement: { label: 'Disengagement', chip: 'bg-sky' },
  Soul: { label: 'Soul Well-Being', chip: 'bg-peach' },
};

function acknowledgement(question: CheckinQuestion, value: number): string {
  // Soul items are positively worded: a high score is good news, not strain.
  if (question.dimension === 'Soul') {
    return value >= 3
      ? 'Senang mendengarnya. Kita jaga ritme ini pelan-pelan.'
      : 'Tidak apa-apa. Hari yang redup juga layak dirawat dengan lembut.';
  }
  return value >= 3
    ? 'Pantas saja rasanya berat. Terima kasih sudah jujur dengan tubuhmu hari ini — kita akan kecilkan targetmu nanti.'
    : 'Tercatat. Tidak ada jawaban yang salah di sini.';
}

export function CheckinPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [checkingExisting, setCheckingExisting] = useState(true);
  const [step, setStep] = useState(0);
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
      .catch(() => {
        // 404 means no check-in yet today; any other error still falls back to the form.
        if (active) setCheckingExisting(false);
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
    setStep(FINAL_STEP);
  };

  const handleSelectAnswer = (key: keyof CheckinAnswers, value: number) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
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
      if (firstIssue?.path[0] === 'answers') {
        const firstMissing = CHECKIN_QUESTIONS.findIndex((q) => answers[q.key] === undefined);
        if (firstMissing >= 0) setStep(firstMissing);
        setFormError('Mohon lengkapi seluruh 9 butir check-in terlebih dahulu.');
      } else {
        setFormError(firstIssue?.message || 'Periksa kembali isian form check-in.');
      }
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
          <div className="k-spinner" />
          <p className="text-sm text-ink-soft">Memeriksa check-in hari ini...</p>
        </div>
      </div>
    );
  }

  const isFinal = step === FINAL_STEP;
  const question = isFinal ? null : CHECKIN_QUESTIONS[step];
  const selected = question ? answers[question.key] : undefined;
  const progress = isFinal ? 100 : Math.round(((step + 1) / TOTAL_QUESTIONS) * 100);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            aria-label="Pertanyaan sebelumnya"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-white transition-colors hover:bg-primary-soft disabled:invisible"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-ink-soft">
              <span data-testid="checkin-step-label">
                {isFinal ? 'Langkah Terakhir' : `${step + 1} dari ${TOTAL_QUESTIONS}`}
              </span>
              <span>{progress}%</span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full border-[1.5px] border-ink bg-white"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Progres check-in"
            >
              <div
                className="h-full rounded-full bg-lime transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
            <Wand2 className="h-3.5 w-3.5" />
            Demo:
          </span>
          {DEMO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              data-testid={preset.id === 'preset-a' ? 'preset-a-button' : 'preset-b-button'}
              title={`${preset.label} — ${preset.description}`}
              className="rounded-full border-[1.5px] border-ink bg-white px-3 py-1 text-xs font-semibold text-ink transition-colors hover:bg-lime"
            >
              {preset.id === 'preset-a' ? 'Preset A' : 'Preset B'}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" data-testid="checkin-form" noValidate>
        {formError && (
          <div className="k-error" data-testid="checkin-error" role="alert">
            {formError}
          </div>
        )}

        {question && (
          <fieldset key={question.key} className="space-y-4">
            <legend className="block w-full space-y-4 p-0">
              <span className="flex justify-center">
                <span className={`k-chip ${DIMENSION_META[question.dimension].chip}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                  {DIMENSION_META[question.dimension].label}
                </span>
              </span>
              <span className="k-card block px-6 py-7 text-center font-serif text-2xl leading-snug font-bold text-ink sm:text-[1.7rem]">
                {question.text}
              </span>
            </legend>

            <div className="space-y-2.5">
              {LIKERT_LABELS.map(({ value, label }) => {
                const isChecked = selected === value;
                return (
                  <label
                    key={value}
                    data-testid={`answer-${question.key}-${value}`}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-ink px-4 py-3 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/30 ${
                      isChecked ? 'bg-lavender' : 'bg-white hover:bg-primary-soft'
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.key}
                      value={value}
                      checked={isChecked}
                      onChange={() => handleSelectAnswer(question.key, value)}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink ${
                        isChecked ? 'bg-ink' : 'bg-white'
                      }`}
                      aria-hidden="true"
                    >
                      {isChecked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="flex-1">
                      {value} · {label}
                    </span>
                    {isChecked && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {selected !== undefined && (
              <div
                className="flex items-start gap-2.5 rounded-2xl border-[1.5px] border-ink bg-mint px-4 py-3 text-sm leading-relaxed text-ink"
                aria-live="polite"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-mint-strong" />
                <span>{acknowledgement(question, selected)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={selected === undefined}
              data-testid="checkin-next"
              className="k-btn-primary w-full"
            >
              Lanjut
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-center text-xs text-ink-faint">Bukan alat diagnosis klinis.</p>
          </fieldset>
        )}

        {isFinal && (
          <div className="space-y-5">
            <section className="k-card space-y-3 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="brain-dump" className="font-serif text-lg font-bold text-ink">
                  Brain Dump <span className="font-sans text-sm font-medium text-ink-faint">(opsional)</span>
                </label>
              </div>
              <textarea
                id="brain-dump"
                rows={4}
                maxLength={2000}
                value={brainDump}
                onChange={(e) => setBrainDump(e.target.value)}
                data-testid="checkin-brain-dump"
                placeholder="Tumpahkan apa saja yang sedang mengganjal pikiranmu hari ini..."
                className="k-input resize-y"
              />
              <p className="text-right text-xs text-ink-faint">{brainDump.length} / 2000</p>
            </section>

            <section className="space-y-3 rounded-3xl border-[1.5px] border-ink bg-lavender p-5">
              <label htmlFor="fun-cope-input" className="flex items-start gap-2">
                <Sparkles className="mt-1 h-4 w-4 shrink-0 text-lavender-strong" />
                <span className="font-serif text-lg leading-snug font-bold text-ink">
                  What fun thing do you always want to do when everything feels tired?
                </span>
              </label>
              <input
                id="fun-cope-input"
                type="text"
                maxLength={200}
                value={funCopeInput}
                onChange={(e) => setFunCopeInput(e.target.value)}
                data-testid="checkin-fun-cope"
                placeholder="Contoh: Rebahan sambil dengerin lagu favorit..."
                className="k-input"
              />
              <div className="flex justify-between gap-3 text-xs text-ink-soft">
                <span>Having a coping mechanism is not a bad thing.</span>
                <span className="shrink-0">{funCopeInput.length} / 200</span>
              </div>
            </section>

            <DisclaimerBanner />

            <button
              type="submit"
              disabled={submitting}
              data-testid="checkin-submit"
              className="k-btn-primary w-full"
            >
              {submitting ? 'Mengkalibrasi hari ini...' : 'Kalibrasi Hari Ini'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
