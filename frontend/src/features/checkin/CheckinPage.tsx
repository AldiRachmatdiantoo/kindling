import { ArrowLeft, ArrowRight, Check, Clock, Smile, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, generateIdempotencyKey } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import { checkinSchema } from '../../api/schemas';
import type { CheckinAnswers, DailyLog } from '../../api/types';
import { DisclaimerBanner } from '../../components/DisclaimerBanner';
import { FeatureTip } from '../../components/FeatureTip';
import type { MascotMood } from '../../components/Mascot';
import { MascotBubble } from '../../components/MascotBubble';
import { MascotDialog } from '../../components/MascotDialog';
import { PageLoading } from '../../components/PageLoading';
import { clearCheckinDefer, deferCheckin } from '../../utils/checkinDefer';
import { getTodayInTimezone } from '../../utils/date';
import { useAuth } from '../auth/AuthContext';
import { TodayOverview } from '../today/TodayOverview';
import { useTodayStatus } from '../today/TodayStatus';
import {
  CHECKIN_QUESTIONS,
  DEMO_PRESETS,
  LIKERT_LABELS,
  type CheckinQuestion,
  type DemoPreset,
} from './constants';
import { Button } from '@/components/watermelon-ui/button';

const INITIAL_ANSWERS: Partial<CheckinAnswers> = {};
const TOTAL_QUESTIONS = CHECKIN_QUESTIONS.length;
const FINAL_STEP = TOTAL_QUESTIONS;

const DIMENSION_META: Record<CheckinQuestion['dimension'], { label: string; chip: string }> = {
  Physical: { label: 'Physical Energy', chip: 'bg-mint' },
  'Work Exhaustion': { label: 'Work Exhaustion', chip: 'bg-lavender' },
  Disengagement: { label: 'Disengagement', chip: 'bg-sky' },
  Soul: { label: 'Soul Well-Being', chip: 'bg-peach' },
};

interface Sympathy {
  title: string;
  body: string;
  mood: MascotMood;
}

function acknowledgement(question: CheckinQuestion, value: number): Sympathy {
  // Soul items are positively worded: a high score is good news, not strain.
  if (question.dimension === 'Soul') {
    return value >= 3
      ? {
          title: 'Love to hear that!',
          body: "Let's keep that rhythm going, nice and easy.",
          mood: 'happy',
        }
      : { title: "That's okay.", body: 'Dimmer days deserve gentle care too.', mood: 'calm' };
  }
  return value >= 3
    ? {
        title: 'No wonder it feels heavy.',
        body: "Thanks for being honest. I'll keep today's goals small so they stay doable.",
        mood: 'calm',
      }
    : { title: 'Got it.', body: 'There are no wrong answers here. Take your time.', mood: 'happy' };
}

export function CheckinPage() {
  const { user } = useAuth();
  const { setStatus, reportLog } = useTodayStatus();
  const firstName = user?.full_name?.trim().split(/\s+/)[0] ?? '';
  const navigate = useNavigate();

  const [checkingExisting, setCheckingExisting] = useState(true);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [answers, setAnswers] = useState<Partial<CheckinAnswers>>(INITIAL_ANSWERS);
  const [brainDump, setBrainDump] = useState('');
  const [funCopeInput, setFunCopeInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [skipProgressTransition, setSkipProgressTransition] = useState(false);
  const [showSympathy, setShowSympathy] = useState(false);
  const sympathyNextRef = useRef<HTMLButtonElement>(null);
  const pointerSelectRef = useRef(false);

  useEffect(() => {
    let active = true;
    checkinApi
      .getToday()
      .then((log) => {
        if (!active) return;
        // Already checked in: show the Today overview instead of bouncing to /wins.
        setTodayLog(log);
        reportLog(log);
        setCheckingExisting(false);
      })
      .catch((err) => {
        if (!active) return;
        // 404 means no check-in yet today. Anything else is a failed lookup: showing the form
        // then would invite a second check-in for a day that may already have one.
        if (err instanceof ApiError && err.status === 404) setStatus('open');
        else setLookupFailed(true);
        setCheckingExisting(false);
      });

    return () => {
      active = false;
    };
  }, [setStatus, reportLog, lookupAttempt]);

  const goToStep = (next: number) => {
    setSkipProgressTransition(false);
    setDirection(next < step ? 'prev' : 'next');
    setStep(next);
  };

  const handleAnswerLater = () => {
    if (user) {
      deferCheckin(user.id, getTodayInTimezone(user.timezone || 'Asia/Jakarta'));
    }
    navigate('/wins');
  };

  const applyPreset = (preset: DemoPreset) => {
    setAnswers({ ...preset.answers });
    setBrainDump(preset.brain_dump);
    setFunCopeInput(preset.fun_cope_input);
    setFormError(null);
    setStarted(true);
    setSkipProgressTransition(true);
    setDirection('next');
    setStep(FINAL_STEP);
  };

  const handleSelectAnswer = (key: keyof CheckinAnswers, value: number) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  };

  const closeSympathy = (advance: boolean) => {
    setShowSympathy(false);
    if (advance) {
      goToStep(step + 1);
      return;
    }
    // Back to the chosen option so keyboard users keep their place.
    const key = CHECKIN_QUESTIONS[step]?.key;
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(`input[name="${key}"]:checked`)?.focus();
    });
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
        if (firstMissing >= 0) goToStep(firstMissing);
        setFormError('Almost there! Please answer all 9 questions first.');
      } else {
        setFormError(firstIssue?.message || 'Something in the form needs another look.');
      }
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = generateIdempotencyKey();
      const log = await checkinApi.submit(parsed.data, idempotencyKey);
      if (user) clearCheckinDefer(user.id);
      reportLog(log);
      navigate('/cope', { state: { dailyLog: log }, replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'CHECKIN_LOCKED') {
          navigate('/wins', { replace: true });
          return;
        }
        setFormError(err.message);
      } else {
        setFormError("Your check-in didn't go through. Give it a moment and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingExisting) {
    return <PageLoading testId="checkin-loading" label="Checking on today's check-in..." />;
  }

  if (lookupFailed) {
    return (
      <div
        className="k-error mx-auto max-w-md p-6 text-center"
        data-testid="checkin-load-error"
        role="alert"
      >
        <p>We couldn't check on today's check-in just now.</p>
        <Button
          onClick={() => {
            setLookupFailed(false);
            setCheckingExisting(true);
            setLookupAttempt((n) => n + 1);
          }}
          variant="secondary"
          className="mt-4"
        >
          Try again
        </Button>
      </div>
    );
  }

  if (todayLog) {
    return <TodayOverview log={todayLog} />;
  }

  const isFinal = step === FINAL_STEP;
  const question = isFinal ? null : CHECKIN_QUESTIONS[step];
  const selected = question ? answers[question.key] : undefined;
  const progress = isFinal ? 100 : Math.round(((step + 1) / TOTAL_QUESTIONS) * 100);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="space-y-2">
        {started && (
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => goToStep(Math.max(0, step - 1))}
              disabled={step === 0}
              aria-label="Previous question"
              className="disabled:invisible"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-ink-soft">
                <span data-testid="checkin-step-label">
                  {isFinal ? 'Last step' : `${step + 1} of ${TOTAL_QUESTIONS}`}
                </span>
                <span>{progress}%</span>
              </div>
              <div
                className="h-2.5 w-full overflow-hidden rounded-full border-[1.5px] border-ink bg-surface"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label="Check-in progress"
              >
                <div
                  className={`h-full rounded-full bg-lime ${skipProgressTransition ? '' : 'transition-[width] duration-300'}`}
                  style={{ width: `${progress}%` }}
                  data-testid="checkin-progress-fill"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            Demo:
          </span>
          {DEMO_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="secondary"
              size="sm"
              onClick={() => applyPreset(preset)}
              data-testid={preset.id === 'preset-a' ? 'preset-a-button' : 'preset-b-button'}
              title={`${preset.label}: ${preset.description}`}
              className="font-semibold hover:bg-lime"
            >
              {preset.id === 'preset-a' ? 'Preset A' : 'Preset B'}
            </Button>
          ))}
          <Button
            variant="link"
            size="sm"
            onClick={handleAnswerLater}
            data-testid="checkin-answer-later"
            className="ml-auto gap-1.5 px-3"
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            Answer later
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" data-testid="checkin-form" noValidate>
        {formError && (
          <div className="k-error" data-testid="checkin-error" role="alert">
            {formError}
          </div>
        )}

        {!started && (
          <div className="k-enter pt-2" data-testid="checkin-intro">
            <MascotBubble
              mood="happy"
              title={`Hey${firstName ? ` ${firstName}` : ''}! Before we start, I have 9 quick questions for you.`}
              actions={
                <Button onClick={() => setStarted(true)} data-testid="checkin-start">
                  Let's go
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            >
              <p>
                Your answers tell me how much energy you've got today. Then I'll size your goals and
                recovery moments to match, so the day feels doable instead of overwhelming.
              </p>
              <p className="mt-2">
                Just answer honestly, there are no wrong answers. It takes about 2 minutes. Not a
                good time? Tap &ldquo;Answer later&rdquo; up top.
              </p>
            </MascotBubble>
          </div>
        )}

        {started && question && (
          <fieldset
            key={question.key}
            className={`space-y-3 ${direction === 'next' ? 'k-step-next' : 'k-step-prev'}`}
          >
            <legend className="block w-full space-y-2.5 p-0">
              <span className="flex justify-center">
                <span className={`k-chip ${DIMENSION_META[question.dimension].chip}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                  {DIMENSION_META[question.dimension].label}
                </span>
              </span>
              <span className="k-card block px-5 py-4 text-center font-serif text-xl leading-snug font-bold text-ink sm:px-6 sm:py-5 sm:text-2xl">
                {question.text}
              </span>
            </legend>

            <div className="space-y-2">
              {LIKERT_LABELS.map(({ value, label }) => {
                const isChecked = selected === value;
                return (
                  <label
                    key={value}
                    data-testid={`answer-${question.key}-${value}`}
                    onPointerDown={() => {
                      pointerSelectRef.current = true;
                    }}
                    onClick={() => {
                      if (!pointerSelectRef.current) return;
                      pointerSelectRef.current = false;
                      handleSelectAnswer(question.key, value);
                      setShowSympathy(true);
                    }}
                    className={`flex min-h-11 items-center gap-3 rounded-2xl border-[1.5px] border-ink px-4 py-2.5 text-sm font-semibold k-press has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/30 ${
                      isChecked ? 'bg-lavender' : 'bg-surface hover:bg-primary-soft'
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.key}
                      value={value}
                      checked={isChecked}
                      onKeyDown={() => {
                        pointerSelectRef.current = false;
                      }}
                      onChange={() => handleSelectAnswer(question.key, value)}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink ${
                        isChecked ? 'bg-ink' : 'bg-surface'
                      }`}
                      aria-hidden="true"
                    >
                      {isChecked && <span className="h-1.5 w-1.5 rounded-full bg-surface" />}
                    </span>
                    <span className="flex-1">
                      {value} · {label}
                    </span>
                    {isChecked && (
                      <span className="k-pop flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <Button
              onClick={() => setShowSympathy(true)}
              disabled={selected === undefined}
              data-testid="checkin-next"
              className="w-full"
            >
              Next
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <p className="text-center text-xs text-ink-faint">Not a clinical diagnosis tool.</p>
          </fieldset>
        )}

        {started && isFinal && (
          <div className={`space-y-5 ${direction === 'next' ? 'k-step-next' : 'k-step-prev'}`}>
            <FeatureTip id="checkin-final" title="Last bit, I promise">
              <p>
                The brain dump is optional. Write whatever's on your mind and I'll use it to suggest
                better recovery ideas. Then tell me one fun thing you love doing and tap Tune my
                day.
              </p>
            </FeatureTip>

            <section className="k-card space-y-3 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="brain-dump" className="font-serif text-lg font-bold text-ink">
                  Brain dump{' '}
                  <span className="font-sans text-sm font-medium text-ink-faint">(optional)</span>
                </label>
              </div>
              <textarea
                id="brain-dump"
                rows={4}
                maxLength={2000}
                value={brainDump}
                onChange={(e) => setBrainDump(e.target.value)}
                data-testid="checkin-brain-dump"
                placeholder="Let it all out. What's weighing on your mind today?"
                className="k-input resize-y"
              />
              <p className="text-right text-xs text-ink-faint">{brainDump.length} / 2000</p>
            </section>

            <section className="space-y-3 rounded-3xl border-[1.5px] border-ink bg-lavender p-5">
              <label htmlFor="fun-cope-input" className="flex items-start gap-2">
                <Smile className="mt-1 h-4 w-4 shrink-0 text-lavender-strong" aria-hidden="true" />
                <span className="font-serif text-lg leading-snug font-bold text-ink">
                  What's one fun thing you always want to do when you're running on empty?
                </span>
              </label>
              <input
                id="fun-cope-input"
                type="text"
                maxLength={200}
                value={funCopeInput}
                onChange={(e) => setFunCopeInput(e.target.value)}
                data-testid="checkin-fun-cope"
                placeholder="e.g. Lying down with my favorite playlist"
                className="k-input"
              />
              <div className="flex justify-between gap-3 text-xs text-ink-soft">
                <span>Having a go-to way to unwind is a good thing.</span>
                <span className="shrink-0">{funCopeInput.length} / 200</span>
              </div>
            </section>

            <DisclaimerBanner />

            <Button
              type="submit"
              disabled={submitting}
              data-testid="checkin-submit"
              className="w-full"
            >
              {submitting ? 'Tuning your day...' : 'Tune my day'}
            </Button>
          </div>
        )}
        {question &&
          selected !== undefined &&
          showSympathy &&
          (() => {
            const sympathy = acknowledgement(question, selected);
            return (
              <MascotDialog
                onClose={() => closeSympathy(false)}
                mood={sympathy.mood}
                title={sympathy.title}
                titleId="sympathy-title"
                initialFocusRef={sympathyNextRef}
                stepKey={`${question.key}-${selected}`}
                testId="checkin-sympathy"
                corner={
                  <span className="text-xs font-semibold text-ink-soft">
                    {step + 1}/{TOTAL_QUESTIONS}
                  </span>
                }
                actions={
                  <>
                    <Button
                      onClick={() => closeSympathy(false)}
                      variant="secondary"
                      data-testid="sympathy-change"
                    >
                      Change answer
                    </Button>
                    <Button
                      ref={sympathyNextRef}
                      onClick={() => closeSympathy(true)}
                      data-testid="sympathy-next"
                    >
                      Next
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                }
              >
                <p>{sympathy.body}</p>
              </MascotDialog>
            );
          })()}
      </form>
    </div>
  );
}
