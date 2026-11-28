import { ArrowLeft, ArrowRight, Check, Smile, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { m } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ApiError, generateIdempotencyKey } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import { checkinSchema } from '../../api/schemas';
import type { CheckinAnswers, DailyLog, Pillar } from '../../api/types';
import { DisclaimerBanner } from '../../components/DisclaimerBanner';
import { FeatureTip } from '../../components/FeatureTip';
import { Mascot } from '../../components/Mascot';
import { MascotBubble } from '../../components/MascotBubble';
import { PageLoading } from '../../components/PageLoading';
import { QuickPicks } from '../../components/QuickPicks';
import { getTodayInTimezone } from '../../utils/date';
import { useAuth } from '../auth/AuthContext';
import { TodayOverview } from '../today/TodayOverview';
import { TIER_META } from '../today/tier';
import { useTodayStatus } from '../today/TodayStatus';
import {
  CHECKIN_QUESTIONS,
  DEMO_PRESETS,
  FUN_PICKS,
  LIKERT_LABELS,
  type CheckinQuestion,
  type DemoPreset,
} from './constants';
import { HabitsStep } from '../habits/HabitsStep';
import { DayConclusion, PILLAR_META, PillarReading } from './CheckinReading';
import {
  PILLAR_ORDER,
  PILLAR_QUESTION_COUNT,
  pillarEndingAt,
  previewScores,
  previewTier,
} from './reading';
import { Button } from '@/components/watermelon-ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const INITIAL_ANSWERS: Partial<CheckinAnswers> = {};
const TOTAL_QUESTIONS = CHECKIN_QUESTIONS.length;
const FINAL_STEP = TOTAL_QUESTIONS;
const GUIDE_PAGES = 3;
// Long enough to see the chosen answer light up, short enough not to feel like waiting.
export const AUTO_ADVANCE_MS = 400;

// Same signal colors as the score bars on the results page, so a dimension keeps its color.
const DIMENSION_META: Record<CheckinQuestion['dimension'], { label: string; dot: string }> = {
  Physical: { label: 'Physical Energy', dot: 'bg-peach-strong' },
  'Work Exhaustion': { label: 'Work Exhaustion', dot: 'bg-sun-strong' },
  Disengagement: { label: 'Disengagement', dot: 'bg-sky-strong' },
  Soul: { label: 'Soul Well-Being', dot: 'bg-mint-strong' },
};

// A dot per answer (Figma): calm green for "not at all" through periwinkle for "very".
const ANSWER_DOT: Record<number, string> = {
  1: 'bg-mint-strong',
  2: 'bg-sun-strong',
  3: 'bg-peach-strong',
  4: 'bg-lavender-strong',
};

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
  // The opening guide, a few short pages instead of one long bubble.
  const [guidePage, setGuidePage] = useState(0);
  const [guideDirection, setGuideDirection] = useState<'next' | 'prev'>('next');
  // Between questions: an early read after each pillar, then the conclusion after the last.
  const [interlude, setInterlude] = useState<
    { kind: 'pillar'; pillar: Pillar } | { kind: 'summary' } | { kind: 'habits' } | null
  >(null);
  const [skipProgressTransition, setSkipProgressTransition] = useState(false);
  // A chosen answer waits AUTO_ADVANCE_MS before moving on; one timer, so a double tap
  // still moves exactly one question.
  const advanceTimerRef = useRef<number | null>(null);
  const [advancePending, setAdvancePending] = useState(false);
  const pointerSelectRef = useRef(false);
  // Set when the user moved on from a question, so focus follows them to the next one.
  const focusQuestionRef = useRef(false);

  const cancelAdvance = () => {
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
    setAdvancePending(false);
  };

  useEffect(
    () => () => {
      if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    },
    [],
  );

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

  const turnGuidePage = (page: number) => {
    setGuideDirection(page < guidePage ? 'prev' : 'next');
    setGuidePage(page);
  };

  const goToStep = (next: number) => {
    cancelAdvance();
    setSkipProgressTransition(false);
    setDirection(next < step ? 'prev' : 'next');
    setStep(next);
  };

  const applyPreset = (preset: DemoPreset) => {
    cancelAdvance();
    setAnswers({ ...preset.answers });
    setBrainDump(preset.brain_dump);
    setFunCopeInput(preset.fun_cope_input);
    setFormError(null);
    setStarted(true);
    setInterlude(null);
    setSkipProgressTransition(true);
    setDirection('next');
    setStep(FINAL_STEP);
  };

  const handleSelectAnswer = (key: keyof CheckinAnswers, value: number) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  };

  const advanceFrom = (from: number) => {
    cancelAdvance();
    focusQuestionRef.current = true;
    const finishedPillar = pillarEndingAt(from);
    if (finishedPillar) setInterlude({ kind: 'pillar', pillar: finishedPillar });
    else goToStep(from + 1);
  };

  // Choosing an answer (click, tap, Enter or Space) moves on by itself after a short beat.
  // Arrow keys only move the selection, so keyboard users can look through the options.
  const chooseAndAdvance = (key: keyof CheckinAnswers, value: number) => {
    handleSelectAnswer(key, value);
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    const from = step;
    setAdvancePending(true);
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      advanceFrom(from);
    }, AUTO_ADVANCE_MS);
  };

  // After moving on, put focus on the new question's answers (the group reads its legend).
  useEffect(() => {
    if (!focusQuestionRef.current || interlude) return;
    focusQuestionRef.current = false;
    const key = CHECKIN_QUESTIONS[step]?.key;
    if (!key) return;
    const radios = document.querySelectorAll<HTMLInputElement>(`input[name="${key}"]`);
    const target = Array.from(radios).find((r) => r.checked) ?? radios[0];
    target?.focus({ preventScroll: true });
  }, [step, interlude]);

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
  const scores = previewScores(answers);
  const stepLabel = isFinal
    ? 'Last step'
    : interlude?.kind === 'summary'
      ? 'Your day'
      : interlude?.kind === 'habits'
        ? 'Your habits'
        : interlude
          ? `${PILLAR_META[interlude.pillar].label} read`
          : `${step + 1} of ${TOTAL_QUESTIONS}`;

  const continueFromPillar = (pillar: Pillar) => {
    if (pillar === PILLAR_ORDER[PILLAR_ORDER.length - 1]) {
      setInterlude({ kind: 'summary' });
      return;
    }
    setInterlude(null);
    goToStep(step + 1);
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="space-y-2">
        {started && (
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                // From a read, step back to the question that finished the pillar.
                cancelAdvance();
                if (interlude?.kind === 'habits') setInterlude({ kind: 'summary' });
                else if (interlude) setInterlude(null);
                else goToStep(Math.max(0, step - 1));
              }}
              disabled={step === 0 && !interlude}
              aria-label="Previous question"
              className="disabled:invisible"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-ink-soft">
                <span data-testid="checkin-step-label">{stepLabel}</span>
                <span>{progress}%</span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
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
          {import.meta.env.VITE_ENABLE_DEMO_PRESETS !== 'false' && (
            <>
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
                  className="font-semibold"
                >
                  {preset.id === 'preset-a' ? 'Preset A' : 'Preset B'}
                </Button>
              ))}
            </>
          )}
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
              key={guidePage}
              className={guideDirection === 'next' ? 'k-step-next' : 'k-step-prev'}
              mood={guidePage === 1 ? 'cheer' : 'happy'}
              title={
                guidePage === 0
                  ? `Hey${firstName ? ` ${firstName}` : ''}! Before we start.`
                  : guidePage === 1
                    ? 'The questions cover 3 pillars'
                    : "Here's how it goes"
              }
              corner={
                <span
                  className="flex items-center gap-1.5"
                  aria-label={`Guide page ${guidePage + 1} of ${GUIDE_PAGES}`}
                  data-testid="checkin-guide-page"
                >
                  {Array.from({ length: GUIDE_PAGES }, (_, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === guidePage ? 'w-4 bg-primary' : 'w-1.5 bg-line-strong'
                      }`}
                    />
                  ))}
                </span>
              }
              actions={
                <>
                  {guidePage === 0 ? (
                    <Button
                      variant="link"
                      onClick={() => setStarted(true)}
                      data-testid="checkin-guide-skip"
                    >
                      Skip guide
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => turnGuidePage(guidePage - 1)}
                      data-testid="checkin-guide-back"
                    >
                      Back
                    </Button>
                  )}
                  {guidePage < GUIDE_PAGES - 1 ? (
                    <Button
                      onClick={() => turnGuidePage(guidePage + 1)}
                      data-testid="checkin-guide-next"
                    >
                      Next
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button onClick={() => setStarted(true)} data-testid="checkin-start">
                      Let's go
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </>
              }
            >
              {guidePage === 0 && (
                <>
                  <p>
                    I have {TOTAL_QUESTIONS} quick questions for you. Your answers decide how big
                    today gets, so the day fits the energy you actually have.
                  </p>
                  <p className="mt-2">It takes about 2 minutes, and there are no wrong answers.</p>
                </>
              )}
              {guidePage === 1 && (
                <ul className="mt-1 space-y-2" data-testid="checkin-guide-pillars">
                  {PILLAR_ORDER.map((pillar) => (
                    <li
                      key={pillar}
                      className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3 py-2"
                    >
                      <Mascot pillar={pillar} className="h-10 w-8 shrink-0" />
                      <span className="min-w-0 flex-1 text-sm leading-snug">
                        <span className="font-bold text-ink">{PILLAR_META[pillar].label}</span>
                        <span className="text-ink-faint">
                          {' '}
                          · {PILLAR_QUESTION_COUNT[pillar]} questions
                        </span>
                        <span className="block text-ink-soft">{PILLAR_META[pillar].about}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {guidePage === 2 && (
                <>
                  <p>After each pillar I'll share an early read of how it's going.</p>
                  <p className="mt-2">At the end I'll put it all together into today's mode:</p>
                  <span className="mt-2.5 flex flex-wrap gap-1.5">
                    {(['gentle', 'balanced', 'standard'] as const).map((tier) => (
                      <span
                        key={tier}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${TIER_META[tier].badgeClass}`}
                      >
                        {TIER_META[tier].label}
                      </span>
                    ))}
                  </span>
                  <p className="mt-2.5">Your 3 Daily Wins are sized to match.</p>
                  <p className="mt-2 text-ink-faint">
                    It takes about 2 minutes, and the rest of the app opens right after.
                  </p>
                </>
              )}
            </MascotBubble>
          </div>
        )}

        {started && interlude?.kind === 'pillar' && (
          <PillarReading
            key={interlude.pillar}
            pillar={interlude.pillar}
            scores={scores}
            isLast={interlude.pillar === PILLAR_ORDER[PILLAR_ORDER.length - 1]}
            onContinue={() => continueFromPillar(interlude.pillar)}
          />
        )}

        {started && interlude?.kind === 'summary' && (
          <DayConclusion
            scores={scores}
            tier={previewTier(scores)}
            onContinue={() => setInterlude({ kind: 'habits' })}
          />
        )}

        {started && question && !interlude && (
          <fieldset
            key={question.key}
            className={`space-y-3 ${direction === 'next' ? 'k-step-next' : 'k-step-prev'}`}
          >
            <legend className="block w-full space-y-2.5 p-0">
              <span className="flex justify-center">
                <Badge>
                  <span
                    className={`h-2 w-2 rounded-full ${DIMENSION_META[question.dimension].dot}`}
                    aria-hidden="true"
                  />
                  {DIMENSION_META[question.dimension].label}
                </Badge>
              </span>
              <span className="block rounded-3xl border border-line bg-surface px-5 py-4 text-center font-serif text-xl leading-snug font-bold text-ink sm:px-6 sm:py-5 sm:text-2xl">
                {question.text}
              </span>
            </legend>

            <div className="grid gap-2 sm:grid-cols-2">
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
                      // Arrow keys also fire click on radios; only a real tap advances.
                      if (!pointerSelectRef.current) return;
                      pointerSelectRef.current = false;
                      chooseAndAdvance(question.key, value);
                    }}
                    className={`relative flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold k-press has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/30 ${
                      isChecked
                        ? 'border-transparent bg-surface-2'
                        : 'border-line bg-surface-2 hover:border-line-strong'
                    }`}
                  >
                    {/* The selection slides to the new answer instead of jumping (layoutId). */}
                    {isChecked && (
                      <m.span
                        layoutId={`answer-pill-${question.key}`}
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute -inset-px rounded-2xl border border-primary bg-primary-soft"
                        aria-hidden="true"
                      />
                    )}
                    <input
                      type="radio"
                      name={question.key}
                      value={value}
                      checked={isChecked}
                      onKeyDown={(e) => {
                        pointerSelectRef.current = false;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          chooseAndAdvance(question.key, value);
                        }
                      }}
                      onChange={() => handleSelectAnswer(question.key, value)}
                      className="sr-only"
                    />
                    <span
                      className={`relative h-2.5 w-2.5 shrink-0 rounded-full ${ANSWER_DOT[value] ?? 'bg-ink-faint'}`}
                      aria-hidden="true"
                    />
                    <span className="relative flex-1">
                      {value} · {label}
                    </span>
                    {isChecked && (
                      <m.span
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                        className="relative flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </m.span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Picking an answer moves on by itself; Next is only for an answer already given. */}
            {selected !== undefined && !advancePending && (
              <Button
                onClick={() => advanceFrom(step)}
                data-testid="checkin-next"
                className="w-full"
              >
                Next
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            <p className="text-center text-xs text-ink-faint">Not a clinical diagnosis tool.</p>
          </fieldset>
        )}

        {started && isFinal && !interlude && (
          <div className={`space-y-5 ${direction === 'next' ? 'k-step-next' : 'k-step-prev'}`}>
            <FeatureTip id="checkin-final" title="Last bit, I promise">
              <p>
                The brain dump is optional. Write whatever's on your mind and I'll use it to suggest
                better recovery ideas. Then tell me one fun thing you love doing and tap Tune my
                day.
              </p>
            </FeatureTip>

            <Card asChild className="space-y-3 p-5">
              <section>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="brain-dump" className="font-serif text-lg font-bold text-ink">
                    Brain dump{' '}
                    <span className="font-sans text-sm font-medium text-ink-faint">(optional)</span>
                  </label>
                </div>
                <Textarea
                  id="brain-dump"
                  rows={4}
                  maxLength={2000}
                  value={brainDump}
                  onChange={(e) => setBrainDump(e.target.value)}
                  data-testid="checkin-brain-dump"
                  placeholder="Let it all out. What's weighing on your mind today?"
                  className="resize-y"
                />
                <p className="text-right text-xs text-ink-faint">{brainDump.length} / 2000</p>
              </section>
            </Card>

            <section className="space-y-3 rounded-3xl border border-line bg-surface p-5">
              <label htmlFor="fun-cope-input" className="flex items-start gap-2">
                <Smile className="mt-1 h-4 w-4 shrink-0 text-lavender-strong" aria-hidden="true" />
                <span className="font-serif text-lg leading-snug font-bold text-ink">
                  What's one fun thing you always want to do when you're running on empty?
                </span>
              </label>
              <Input
                id="fun-cope-input"
                type="text"
                maxLength={200}
                value={funCopeInput}
                onChange={(e) => setFunCopeInput(e.target.value)}
                data-testid="checkin-fun-cope"
                placeholder="e.g. Lying down with my favorite playlist"
              />
              <QuickPicks
                options={FUN_PICKS}
                targetId="fun-cope-input"
                value={funCopeInput}
                onPick={setFunCopeInput}
                label="Quick picks for your fun thing"
                testIdPrefix="fun-pick"
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
      </form>

      {/* Outside the check-in form: the habits form is a form of its own. */}
      {started && interlude?.kind === 'habits' && (
        <HabitsStep
          onDone={() => {
            setInterlude(null);
            goToStep(FINAL_STEP);
          }}
        />
      )}
    </div>
  );
}
