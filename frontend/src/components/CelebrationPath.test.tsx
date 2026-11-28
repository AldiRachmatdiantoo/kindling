import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PillarProgress } from '../api/types';
import { CelebrationPath, chestsReached, columnSway, pathSteps } from './CelebrationPath';

function pillar(total: number): PillarProgress {
  return {
    completed_total: total,
    checkpoints: [],
    next_checkpoint_at: (Math.floor(total / 3) + 1) * 3,
    last_completed_on: '2026-11-28',
  };
}

describe('CelebrationPath', () => {
  it('draws two steps behind, the new one, and the next one', () => {
    expect(pathSteps(1)).toEqual([1, 2]);
    expect(pathSteps(2)).toEqual([1, 2, 3]);
    expect(pathSteps(9)).toEqual([7, 8, 9, 10]);
  });

  it('winds like the profile path, only narrower', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(columnSway)).toEqual([0, 12, 24, 12, 0, -12, -24, -12]);
  });

  it('knows which pillars reached a checkpoint today', () => {
    expect(chestsReached({ physical: pillar(9), work: pillar(5), soul: pillar(6) })).toEqual([
      'physical',
      'soul',
    ]);
    expect(chestsReached({ physical: pillar(1), work: pillar(1), soul: pillar(1) })).toEqual([]);
  });

  it('marks the new step, opens a reached chest, and leaves the next step empty', () => {
    render(
      <CelebrationPath progress={{ physical: pillar(9), work: pillar(5), soul: pillar(2) }} />,
    );
    const physical = within(screen.getByTestId('celebration-path-physical'));
    const steps = physical.getAllByRole('listitem', { hidden: true });
    expect(steps.map((li) => li.className)).toEqual([
      'kc-step kc-step-done',
      'kc-step kc-step-done',
      'kc-step kc-step-new kc-step-chest',
      'kc-step kc-step-next',
    ]);
    expect(screen.getByTestId('celebration-path-physical')).toHaveTextContent('Physical');
    expect(screen.getByTestId('celebration-path-soul')).toHaveTextContent('2 wins');
    // Decorative: the caption carries the message for screen readers.
    expect(screen.getByTestId('celebration-path')).toHaveAttribute('aria-hidden', 'true');
  });
});
