import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PillarProgress, PillarProgressSet } from '../../api/types';
import { appreciationNote } from './appreciation';
import { MilestonePath, positionLabel } from './MilestonePath';

const none: PillarProgress = {
  completed_total: 0,
  checkpoints: [],
  next_checkpoint_at: 3,
  last_completed_on: null,
};

const partial: PillarProgressSet = {
  physical: {
    completed_total: 7,
    checkpoints: [
      { number: 1, reached_on: '2026-11-08' },
      { number: 2, reached_on: '2026-11-20' },
    ],
    next_checkpoint_at: 9,
    last_completed_on: '2026-11-26',
  },
  work: {
    completed_total: 1,
    checkpoints: [],
    next_checkpoint_at: 3,
    last_completed_on: '2026-11-10',
  },
  soul: none,
};

const TODAY = '2026-11-27';

describe('MilestonePath', () => {
  it('shows an empty state when no pillar has a win yet', () => {
    render(<MilestonePath progress={{ physical: none, work: none, soul: none }} today={TODAY} />);
    expect(screen.getByTestId('milestone-empty')).toHaveTextContent('Your path starts');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names each pillar path and marks where the user last got to', () => {
    render(<MilestonePath progress={partial} today={TODAY} />);

    expect(screen.getByRole('group', { name: 'Physical: 7 wins, 2 checkpoints' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Work: 1 win, 0 checkpoints' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Soul: 0 wins, 0 checkpoints' })).toBeVisible();

    expect(screen.getByTestId('milestone-physical-marker')).toHaveTextContent(
      'Yesterday you got here',
    );
    expect(screen.getByTestId('milestone-work-marker')).toHaveTextContent(
      'Last time you got here · Nov 10, 2026',
    );
    expect(screen.getByTestId('milestone-soul-marker')).toHaveTextContent('first soul win');

    // Only reached checkpoints are buttons; the upcoming chest is decoration.
    const physical = screen.getByTestId('milestone-physical');
    expect(within(physical).getAllByRole('button')).toHaveLength(2);
    expect(within(screen.getByTestId('milestone-work')).queryByRole('button')).toBeNull();
    // No percentages or streaks anywhere.
    expect(document.body.textContent).not.toMatch(/%|streak/i);
  });

  it('opens a checkpoint chest with its appreciation note and date', async () => {
    const user = userEvent.setup();
    render(<MilestonePath progress={partial} today={TODAY} />);

    const chest = screen.getByRole('button', { name: /Checkpoint 2, reached Nov 20, 2026/ });
    expect(chest).toHaveAttribute('aria-expanded', 'false');

    chest.focus();
    await user.keyboard('{Enter}');

    expect(chest).toHaveAttribute('aria-expanded', 'true');
    const note = screen.getByTestId('milestone-physical-note');
    expect(note).toHaveTextContent('Checkpoint 2 · Nov 20, 2026');
    expect(note).toHaveTextContent(appreciationNote('physical', 2));

    await user.keyboard(' ');
    expect(chest).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('milestone-physical-note')).toBeNull();
  });

  it('keeps long paths short until earlier checkpoints are asked for', () => {
    const checkpoints = Array.from({ length: 5 }, (_, i) => ({
      number: i + 1,
      reached_on: `2026-10-${String(i + 10).padStart(2, '0')}`,
    }));
    render(
      <MilestonePath
        progress={{
          physical: {
            completed_total: 16,
            checkpoints,
            next_checkpoint_at: 18,
            last_completed_on: '2026-10-20',
          },
          work: none,
          soul: none,
        }}
        today={TODAY}
      />,
    );
    const physical = screen.getByTestId('milestone-physical');
    expect(within(physical).getAllByRole('button', { name: /^Checkpoint/ })).toHaveLength(3);

    fireEvent.click(screen.getByTestId('milestone-physical-earlier'));
    expect(within(physical).getAllByRole('button', { name: /^Checkpoint/ })).toHaveLength(5);
  });
});

describe('positionLabel', () => {
  it('says today, yesterday, or the date', () => {
    expect(positionLabel('2026-11-27', TODAY)).toBe('Today you got here');
    expect(positionLabel('2026-11-26', TODAY)).toBe('Yesterday you got here');
    expect(positionLabel('2026-03-01', '2026-03-02')).toBe('Yesterday you got here');
    expect(positionLabel('2026-11-01', TODAY)).toBe('Last time you got here · Nov 1, 2026');
  });
});

describe('appreciationNote', () => {
  it('is deterministic per pillar and checkpoint number', () => {
    expect(appreciationNote('soul', 1)).toBe(appreciationNote('soul', 1));
    expect(appreciationNote('soul', 1)).not.toBe(appreciationNote('soul', 2));
    expect(appreciationNote('work', 1)).not.toBe(appreciationNote('soul', 1));
    expect(appreciationNote('work', 7)).toBe(appreciationNote('work', 1));
  });
});
