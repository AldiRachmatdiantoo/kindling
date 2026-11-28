import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PillarProgress, PillarProgressSet } from '../../api/types';
import { appreciationNote } from './appreciation';
import { defaultPillar, MilestonePath, positionLabel, stepOffset } from './MilestonePath';

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

function steps(pillar: string) {
  return within(screen.getByTestId(`milestone-${pillar}`)).getAllByRole('listitem', {
    hidden: true,
  });
}

describe('MilestonePath', () => {
  it('shows an empty state when no pillar has a win yet', () => {
    render(<MilestonePath progress={{ physical: none, work: none, soul: none }} today={TODAY} />);
    expect(screen.getByTestId('milestone-empty')).toHaveTextContent('Your path starts');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens on the pillar moved most recently and names its path', () => {
    render(<MilestonePath progress={partial} today={TODAY} />);

    expect(screen.getByRole('tab', { name: /Physical/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/Physical/);
    expect(screen.getByRole('group', { name: 'Physical: 7 wins, 2 checkpoints' })).toBeVisible();
    expect(screen.getByTestId('milestone-physical-marker')).toHaveTextContent(
      'Yesterday you got here',
    );

    // 7 wins up to the next chest at 9: steps 1..9, two reached chests are buttons.
    expect(steps('physical')).toHaveLength(9);
    expect(
      within(screen.getByTestId('milestone-physical')).getAllByRole('button', {
        name: /^Checkpoint/,
      }),
    ).toHaveLength(2);
    // No percentages or streaks anywhere.
    expect(document.body.textContent).not.toMatch(/%|streak/i);
  });

  it('switches pillars with a click or the arrow keys, like any tab list', async () => {
    const user = userEvent.setup();
    render(<MilestonePath progress={partial} today={TODAY} />);

    await user.click(screen.getByRole('tab', { name: /Work/ }));
    expect(screen.getByRole('group', { name: 'Work: 1 win, 0 checkpoints' })).toBeVisible();
    expect(screen.getByTestId('milestone-work-marker')).toHaveTextContent(
      'Last time you got here · Nov 10, 2026',
    );
    expect(within(screen.getByTestId('milestone-work')).queryByRole('button')).toBeNull();

    await user.keyboard('{ArrowRight}');
    const soulTab = screen.getByRole('tab', { name: /Soul/ });
    expect(soulTab).toHaveFocus();
    expect(soulTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('milestone-soul-marker')).toHaveTextContent('first soul win');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Physical/ })).toHaveFocus();
    await user.keyboard('{End}');
    expect(soulTab).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: /Physical/ })).toHaveAttribute('aria-selected', 'true');

    // Only the selected tab sits in the Tab order.
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([0, -1, -1]);
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
    expect(within(physical).getAllByRole('button', { name: /^Checkpoint/ })).toHaveLength(2);
    expect(screen.getByTestId('milestone-physical-earlier')).toHaveTextContent(
      'Show 3 earlier checkpoints',
    );

    fireEvent.click(screen.getByTestId('milestone-physical-earlier'));
    expect(within(physical).getAllByRole('button', { name: /^Checkpoint/ })).toHaveLength(5);
    expect(steps('physical')).toHaveLength(18);
  });

  it('puts the mascot beside the last finished step, on the open side of the path', () => {
    render(<MilestonePath progress={partial} today={TODAY} />);
    const mascot = screen.getByTestId('milestone-physical-mascot');
    // Step 7 sways left, so the mascot stands on its right, on the 7th row.
    expect(stepOffset(7)).toBeLessThan(0);
    expect(mascot.style.left).toBe(`calc(50% + ${stepOffset(7) + 84}px)`);
    expect(mascot.style.top).toBe(`${6 * 72 + 36}px`);
  });
});

describe('defaultPillar', () => {
  it('picks the most recent pillar, or Physical when there is no win', () => {
    expect(defaultPillar(partial)).toBe('physical');
    expect(
      defaultPillar({
        ...partial,
        soul: { ...none, completed_total: 1, last_completed_on: TODAY },
      }),
    ).toBe('soul');
    expect(defaultPillar({ physical: none, work: none, soul: none })).toBe('physical');
  });
});

describe('stepOffset', () => {
  it('sways left and right and repeats every 8 steps', () => {
    const offsets = Array.from({ length: 8 }, (_, i) => stepOffset(i + 1));
    expect(offsets).toEqual([0, 34, 68, 34, 0, -34, -68, -34]);
    expect(stepOffset(9)).toBe(stepOffset(1));
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
