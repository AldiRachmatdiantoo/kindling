import { ArrowRight, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { habitsApi } from '../../api/endpoints';
import type { HabitsData } from '../../api/types';
import { EMPTY_HABITS, HabitsForm, HabitsSummary, hasAnyHabit } from './HabitsForm';
import { Button } from '@/components/watermelon-ui/button';

/**
 * The check-in step after the day's mode is known: one thing per pillar the user wants to
 * grow. Today's 3 wins are built from these, sized to the mode. Saved habits show as a
 * short list to confirm or edit, so returning users only tap once.
 */
export function HabitsStep({ onDone }: { onDone: () => void }) {
  const [habits, setHabits] = useState<HabitsData | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    habitsApi
      .get()
      .then((h) => {
        if (!active) return;
        setHabits(h);
        setEditing(!hasAnyHabit(h));
      })
      .catch(() => {
        if (!active) return;
        // Could not load: offer the empty form; saving reports its own error.
        setHabits(EMPTY_HABITS);
        setEditing(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (next: HabitsData) => {
    if (!hasAnyHabit(next)) {
      onDone();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setHabits(await habitsApi.put(next));
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Your habits didn't save. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="k-step-next space-y-4 rounded-3xl border border-line bg-surface p-5 sm:p-6"
      data-testid="checkin-habits"
      aria-labelledby="habits-step-title"
    >
      <div>
        <h2 id="habits-step-title" className="font-serif text-xl font-bold text-ink">
          {editing ? 'What do you want to grow?' : 'Your habits'}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          {editing
            ? "Pick one thing per pillar you enjoy or want to get better at. Every day I'll turn it into a step sized to your energy."
            : "Today's 3 wins are built from these, sized to your mode."}
        </p>
      </div>

      {habits === null ? (
        <div className="flex min-h-24 items-center justify-center" data-testid="habits-loading">
          <span className="k-spinner h-6 w-6" aria-label="Loading your habits" />
        </div>
      ) : editing ? (
        <HabitsForm
          initial={habits}
          onSubmit={save}
          error={error}
          idPrefix="checkin-habit"
          actions={
            <>
              <Button
                type="button"
                variant="link"
                onClick={hasAnyHabit(habits) ? () => setEditing(false) : onDone}
                data-testid="habits-skip"
              >
                {hasAnyHabit(habits) ? 'Cancel' : 'Skip for now'}
              </Button>
              <Button type="submit" disabled={saving} data-testid="habits-save">
                {saving ? 'Saving...' : 'Save and continue'}
                {!saving && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </>
          }
        />
      ) : (
        <>
          <HabitsSummary habits={habits} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setEditing(true)}
              data-testid="habits-edit"
              className="gap-1.5"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </Button>
            <Button onClick={onDone} data-testid="habits-keep">
              Keep these
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
