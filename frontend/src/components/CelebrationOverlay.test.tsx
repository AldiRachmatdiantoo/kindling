import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CelebrationOverlay } from './CelebrationOverlay';

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
});
