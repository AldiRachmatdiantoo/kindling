import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PillarProgress, PillarProgressSet } from '../api/types';
import { CelebrationOverlay, PATH_BEAT_MS, PATH_HANDOFF_MS } from './CelebrationOverlay';

function pillar(total: number): PillarProgress {
  const reached = Math.floor(total / 3);
  return {
    completed_total: total,
    checkpoints: Array.from({ length: reached }, (_, i) => ({
      number: i + 1,
      reached_on: '2026-11-28',
    })),
    next_checkpoint_at: (reached + 1) * 3,
    last_completed_on: '2026-11-28',
  };
}

const progress: PillarProgressSet = { physical: pillar(9), work: pillar(5), soul: pillar(2) };

describe('CelebrationOverlay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the pillar mascot message and the new count, and waits for the user', () => {
    const onDone = vi.fn();
    render(
      <CelebrationOverlay
        celebration={{ id: 1, kind: 'win', pillar: 'physical', count: 2 }}
        onDone={onDone}
      />,
    );

    expect(screen.getByTestId('win-celebration')).toHaveAttribute('data-kind', 'win');
    expect(screen.getByText('Body win done!')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(30000));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('win-celebration')).toBeInTheDocument();
  });

  it('celebrates all three wins and closes early on Escape', () => {
    const onDone = vi.fn();
    render(<CelebrationOverlay celebration={{ id: 2, kind: 'all' }} onDone={onDone} />);

    expect(screen.getByText('All 3 daily wins!')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(400));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('closes on a tap anywhere', () => {
    const onDone = vi.fn();
    render(
      <CelebrationOverlay
        celebration={{ id: 3, kind: 'win', pillar: 'soul', count: 1 }}
        onDone={onDone}
      />,
    );
    fireEvent.click(screen.getByTestId('win-celebration'));
    act(() => vi.advanceTimersByTime(400));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('acts as an accessible modal dialog with focusable dismiss button and body scroll lock', () => {
    const onDone = vi.fn();
    const { unmount } = render(
      <CelebrationOverlay
        celebration={{ id: 4, kind: 'win', pillar: 'work', count: 1 }}
        onDone={onDone}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.documentElement.style.overflow).toBe('hidden');

    const dismissBtn = screen.getByTestId('win-celebration-close');
    expect(dismissBtn).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(dismissBtn).toHaveFocus();

    unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('hands 3 out of 3 over to the Milestone Path once the crew has had its moment', () => {
    render(
      <CelebrationOverlay
        celebration={{ id: 5, kind: 'all' }}
        pathProgress={progress}
        onDone={vi.fn()}
      />,
    );
    const overlay = screen.getByTestId('win-celebration');
    expect(overlay).toHaveAttribute('data-beat', 'cheer');
    expect(screen.queryByTestId('celebration-path')).toBeNull();

    act(() => vi.advanceTimersByTime(PATH_BEAT_MS));
    // The crew fades out first, so the paths never cut in.
    expect(overlay).toHaveAttribute('data-beat', 'handoff');
    expect(screen.queryByTestId('celebration-path')).toBeNull();

    act(() => vi.advanceTimersByTime(PATH_HANDOFF_MS));
    expect(overlay).toHaveAttribute('data-beat', 'path');
    expect(screen.getByTestId('celebration-path-physical')).toHaveTextContent('9 wins');
    expect(screen.getByRole('heading', { name: 'Your path grew 3 steps' })).toBeInTheDocument();
    expect(screen.getByText(/Physical reached a checkpoint/)).toBeInTheDocument();
  });

  it('keeps the crew on stage when the path totals never arrive, and moves on when they do', () => {
    const onDone = vi.fn();
    const all = { id: 6, kind: 'all' } as const;
    const { rerender } = render(
      <CelebrationOverlay celebration={all} pathProgress={null} onDone={onDone} />,
    );
    act(() => vi.advanceTimersByTime(PATH_BEAT_MS * 3));
    expect(screen.getByTestId('win-celebration')).toHaveAttribute('data-beat', 'cheer');
    expect(screen.getByText('All 3 daily wins!')).toBeInTheDocument();

    rerender(<CelebrationOverlay celebration={all} pathProgress={progress} onDone={onDone} />);
    act(() => vi.advanceTimersByTime(PATH_HANDOFF_MS));
    expect(screen.getByTestId('win-celebration')).toHaveAttribute('data-beat', 'path');
  });

  it('never shows the path for a single win', () => {
    render(
      <CelebrationOverlay
        celebration={{ id: 7, kind: 'win', pillar: 'soul', count: 2 }}
        pathProgress={progress}
        onDone={vi.fn()}
      />,
    );
    act(() => vi.advanceTimersByTime(PATH_BEAT_MS * 2));
    expect(screen.queryByTestId('celebration-path')).toBeNull();
  });
});
