import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BreathingPacer, getBreathingPhase } from './BreathingPacer';
import { CountdownTimer } from './CountdownTimer';

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down when started, pauses, resets, and triggers onComplete at 00:00', () => {
    const onComplete = vi.fn();
    render(<CountdownTimer durationSeconds={5} onComplete={onComplete} testIdPrefix="focus" />);

    expect(screen.getByTestId('focus-display')).toHaveTextContent('00:05');

    // Start
    fireEvent.click(screen.getByTestId('focus-toggle'));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('focus-display')).toHaveTextContent('00:03');

    // Pause
    fireEvent.click(screen.getByTestId('focus-toggle'));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('focus-display')).toHaveTextContent('00:03');

    // Reset
    fireEvent.click(screen.getByTestId('focus-reset'));
    expect(screen.getByTestId('focus-display')).toHaveTextContent('00:05');

    // Run to completion
    fireEvent.click(screen.getByTestId('focus-toggle'));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('focus-display')).toHaveTextContent('00:00');
    expect(screen.getByTestId('focus-completed')).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('BreathingPacer (4-7-8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cycles through Tarik Napas (4s), Tahan (7s), and Hembuskan (8s)', () => {
    expect(getBreathingPhase(0).phase.name).toBe('Tarik Napas');
    expect(getBreathingPhase(4).phase.name).toBe('Tahan');
    expect(getBreathingPhase(11).phase.name).toBe('Hembuskan');
    expect(getBreathingPhase(19).phase.name).toBe('Tarik Napas');

    render(<BreathingPacer durationSeconds={38} />);
    expect(screen.getByTestId('breathing-phase')).toHaveTextContent('Siap');

    fireEvent.click(screen.getByTestId('breathing-toggle'));
    expect(screen.getByTestId('breathing-phase')).toHaveTextContent('Tarik Napas');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByTestId('breathing-phase')).toHaveTextContent('Tahan');

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByTestId('breathing-phase')).toHaveTextContent('Hembuskan');
  });
});
