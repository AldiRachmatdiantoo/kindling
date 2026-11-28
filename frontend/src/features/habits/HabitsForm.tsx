import { useState, type FormEvent, type ReactNode } from 'react';
import type { HabitsData, Pillar } from '../../api/types';
import { Mascot } from '../../components/Mascot';
import { QuickPicks } from '../../components/QuickPicks';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const HABIT_PILLARS: Pillar[] = ['physical', 'work', 'soul'];

export const MAX_ACTIVITY = 120;
export const MAX_STRUGGLE = 200;

export const HABIT_COPY: Record<
  Pillar,
  {
    label: string;
    prompt: string;
    placeholder: string;
    strugglePlaceholder: string;
    /** Tap-to-fill examples under the activity input. */
    picks: readonly string[];
  }
> = {
  physical: {
    label: 'Physical',
    prompt: 'Something for your body you enjoy, or want to do more of',
    placeholder: 'e.g. morning run, stretching, cycling',
    strugglePlaceholder: 'e.g. too sleepy in the morning',
    picks: ['Morning walk', 'Stretching', 'Cycling', 'Yoga', 'Bodyweight workout'],
  },
  work: {
    label: 'Work',
    prompt: 'Something for your work or study you want to get better at',
    placeholder: 'e.g. learning Go, reading papers, deep work',
    strugglePlaceholder: 'e.g. I keep opening my phone',
    picks: [
      'Deep work block',
      'Learning a new skill',
      'Reading papers',
      'Clearing my inbox',
      'Planning my week',
    ],
  },
  soul: {
    label: 'Soul',
    prompt: 'Something for your heart that makes you feel good',
    placeholder: 'e.g. reading, journaling, playing guitar',
    strugglePlaceholder: 'e.g. I never find the time',
    picks: ['Reading', 'Journaling', 'Playing guitar', 'Calling a friend', 'Drawing'],
  },
};

export const EMPTY_HABITS: HabitsData = { physical: null, work: null, soul: null };

export const hasAnyHabit = (h: HabitsData | null) =>
  !!h && HABIT_PILLARS.some((p) => (h[p]?.activity ?? '').trim() !== '');

type Draft = Record<Pillar, { activity: string; struggle: string }>;

const toDraft = (h: HabitsData): Draft =>
  Object.fromEntries(
    HABIT_PILLARS.map((p) => [
      p,
      { activity: h[p]?.activity ?? '', struggle: h[p]?.struggle ?? '' },
    ]),
  ) as Draft;

const fromDraft = (d: Draft): HabitsData =>
  Object.fromEntries(
    HABIT_PILLARS.map((p) => {
      const activity = d[p].activity.trim();
      return [p, activity ? { activity, struggle: d[p].struggle.trim() } : null];
    }),
  ) as unknown as HabitsData;

/**
 * One row per pillar: the activity the user wants to grow, and (optionally) what usually
 * gets in the way, which the AI uses to pick a step that gets around it.
 */
export function HabitsForm({
  initial,
  onSubmit,
  actions,
  error,
  idPrefix = 'habit',
}: {
  initial: HabitsData;
  onSubmit: (habits: HabitsData) => void;
  /** The form's buttons; the submit button needs type="submit". */
  actions: ReactNode;
  error?: string | null;
  idPrefix?: string;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));

  const set = (pillar: Pillar, field: 'activity' | 'struggle', value: string) =>
    setDraft((prev) => ({ ...prev, [pillar]: { ...prev[pillar], [field]: value } }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(fromDraft(draft));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="habits-form" noValidate>
      {error && (
        <div className="k-error" role="alert" data-testid="habits-error">
          {error}
        </div>
      )}
      {HABIT_PILLARS.map((pillar) => {
        const copy = HABIT_COPY[pillar];
        const activityId = `${idPrefix}-${pillar}-activity`;
        const struggleId = `${idPrefix}-${pillar}-struggle`;
        return (
          <fieldset
            key={pillar}
            className="space-y-2.5 rounded-2xl border border-line bg-surface-2 p-4"
          >
            <legend className="sr-only">{copy.label}</legend>
            <div className="flex items-center gap-3">
              <Mascot pillar={pillar} className="h-10 w-8 shrink-0" />
              <Label htmlFor={activityId} className="block text-sm leading-snug">
                <span className="font-bold text-ink">{copy.label}</span>
                <span className="block font-normal text-ink-soft">{copy.prompt}</span>
              </Label>
            </div>
            <Input
              id={activityId}
              value={draft[pillar].activity}
              maxLength={MAX_ACTIVITY}
              onChange={(e) => set(pillar, 'activity', e.target.value)}
              placeholder={copy.placeholder}
              data-testid={`habit-${pillar}-activity`}
            />
            <QuickPicks
              options={copy.picks}
              targetId={activityId}
              value={draft[pillar].activity}
              onPick={(option) => set(pillar, 'activity', option)}
              label={`Quick picks for your ${copy.label.toLowerCase()} habit`}
              testIdPrefix={`${idPrefix}-${pillar}-pick`}
            />
            <div>
              <Label
                htmlFor={struggleId}
                className="mb-1.5 block text-xs font-semibold text-ink-soft"
              >
                What usually gets in the way?{' '}
                <span className="font-normal text-ink-faint">(optional)</span>
              </Label>
              <Input
                id={struggleId}
                value={draft[pillar].struggle}
                maxLength={MAX_STRUGGLE}
                onChange={(e) => set(pillar, 'struggle', e.target.value)}
                placeholder={copy.strugglePlaceholder}
                disabled={draft[pillar].activity.trim() === ''}
                data-testid={`habit-${pillar}-struggle`}
              />
            </div>
          </fieldset>
        );
      })}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
        {actions}
      </div>
    </form>
  );
}

/** Read-only list of the set habits, for the check-in and the profile. */
export function HabitsSummary({ habits }: { habits: HabitsData }) {
  return (
    <ul className="space-y-2" data-testid="habits-summary">
      {HABIT_PILLARS.map((pillar) => {
        const h = habits[pillar];
        return (
          <li
            key={pillar}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3 py-2.5"
          >
            <Mascot pillar={pillar} className="h-10 w-8 shrink-0" />
            <span className="min-w-0 flex-1 text-sm leading-snug">
              <span className="font-bold text-ink">{HABIT_COPY[pillar].label}</span>
              {h ? (
                <>
                  <span className="block text-ink">{h.activity}</span>
                  {h.struggle && (
                    <span className="block text-xs text-ink-faint">In the way: {h.struggle}</span>
                  )}
                </>
              ) : (
                <span className="block text-ink-faint">Not set, Ember picks one each day</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
