import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_HABITS, HABIT_COPY, HABIT_PILLARS, HabitsForm } from '../features/habits/HabitsForm';
import { SWAP_PICKS } from '../features/wins/WinCard';
import { QuickPicks } from './QuickPicks';

describe('QuickPicks', () => {
  it('names each chip and the group for screen readers', () => {
    render(
      <>
        <input id="target" />
        <QuickPicks
          options={['Yoga', 'A short walk']}
          targetId="target"
          value=""
          onPick={() => {}}
          label="Quick picks for today's physical win"
          testIdPrefix="pick"
        />
      </>,
    );
    expect(
      screen.getByRole('group', { name: "Quick picks for today's physical win" }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use "A short walk"' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('disables every chip while busy', () => {
    render(
      <QuickPicks
        options={['Yoga', 'A short walk']}
        targetId="target"
        value=""
        onPick={() => {}}
        label="Picks"
        disabled
        testIdPrefix="pick"
      />,
    );
    for (const chip of screen.getAllByRole('button')) expect(chip).toBeDisabled();
  });
});

describe('HabitsForm quick picks', () => {
  it('offers 4 to 5 picks per pillar, specific to that pillar', () => {
    const seen = new Set<string>();
    for (const pillar of HABIT_PILLARS) {
      const picks = HABIT_COPY[pillar].picks;
      expect(picks.length).toBeGreaterThanOrEqual(4);
      expect(picks.length).toBeLessThanOrEqual(5);
      for (const pick of picks) {
        expect(seen.has(pick)).toBe(false);
        seen.add(pick);
      }
    }
    for (const picks of Object.values(SWAP_PICKS)) {
      expect(picks!.length).toBeGreaterThanOrEqual(4);
      expect(picks!.length).toBeLessThanOrEqual(5);
    }
  });

  it('fills the pillar activity, keeps it editable, and never submits the form', async () => {
    const onSubmit = vi.fn();
    render(
      <HabitsForm
        initial={EMPTY_HABITS}
        onSubmit={onSubmit}
        actions={<button type="submit">Save</button>}
      />,
    );
    const pick = HABIT_COPY.soul.picks[1];
    fireEvent.click(screen.getByRole('button', { name: `Use "${pick}"` }));
    expect(onSubmit).not.toHaveBeenCalled();

    const input = screen.getByTestId('habit-soul-activity');
    expect(input).toHaveValue(pick);
    expect(screen.getByTestId('habit-physical-activity')).toHaveValue('');
    await waitFor(() => expect(document.activeElement).toBe(input));
    // The struggle field unlocks once an activity is in.
    expect(screen.getByTestId('habit-soul-struggle')).toBeEnabled();

    fireEvent.change(input, { target: { value: `${pick} before bed` } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      physical: null,
      work: null,
      soul: { activity: `${pick} before bed`, struggle: '' },
    });
  });
});
