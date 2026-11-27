import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { habitsApi } from '../../api/endpoints';
import type { HabitsData } from '../../api/types';
import { EMPTY_HABITS, HabitsForm, HabitsSummary, hasAnyHabit } from './HabitsForm';
import { Button } from '@/components/watermelon-ui/button';
import { Card } from '@/components/ui/card';

/**
 * Profile card for the standing habits. Changing one here changes every day from the next
 * check-in on; trading a win for one day happens on the win card instead.
 */
export function HabitsCard() {
  const [habits, setHabits] = useState<HabitsData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    let active = true;
    habitsApi
      .get()
      .then((h) => active && setHabits(h))
      .catch(() => {
        if (!active) return;
        setHabits(EMPTY_HABITS);
        setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (next: HabitsData) => {
    setSaving(true);
    setError(null);
    try {
      setHabits(await habitsApi.put(next));
      setEditing(false);
      setSavedNote(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Your habits didn't save. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card asChild className="space-y-4 p-6">
      <section data-testid="profile-habits" aria-labelledby="profile-habits-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="profile-habits-title" className="text-2xl font-bold text-ink">
              Your habits
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Each day's 3 wins are built from these, sized to that day's energy. Changes count from
              your next check-in.
            </p>
          </div>
          {habits && !editing && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(true);
                setSavedNote(false);
              }}
              data-testid="profile-habits-edit"
              className="gap-1.5"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {hasAnyHabit(habits) ? 'Edit' : 'Set your habits'}
            </Button>
          )}
        </div>

        {habits === null ? (
          <div className="flex min-h-24 items-center justify-center">
            <span className="k-spinner h-6 w-6" aria-label="Loading your habits" />
          </div>
        ) : editing ? (
          <HabitsForm
            initial={habits}
            onSubmit={save}
            error={error}
            idPrefix="profile-habit"
            actions={
              <>
                <Button type="button" variant="link" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} data-testid="profile-habits-save">
                  {saving ? 'Saving...' : 'Save habits'}
                </Button>
              </>
            }
          />
        ) : (
          <>
            {loadFailed && (
              <p className="text-sm text-ink-soft">
                Your habits couldn't load just now. You can still set them.
              </p>
            )}
            <HabitsSummary habits={habits} />
            <p aria-live="polite" className="text-xs font-semibold text-mint-strong">
              {savedNote ? 'Saved. Your next check-in will use these.' : ''}
            </p>
          </>
        )}
      </section>
    </Card>
  );
}
