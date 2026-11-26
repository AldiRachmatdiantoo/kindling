import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BREATHING_PATTERNS,
  getBreathingPhase,
  pickBreathingPattern,
} from './breathingPatterns';
import { CountdownTimer } from './CountdownTimer';

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps running while its page is closed and picks up the real time on return', () => {
    sessionStorage.clear();
    const first = render(
      <CountdownTimer durationSeconds={600} testIdPrefix="nav" persistKey="t1" />,
    );
    fireEvent.click(screen.getByTestId('nav-toggle'));
    first.unmount(); // the user switches to another tab

    act(() => {
      vi.setSystemTime(Date.now() + 120_000);
    });
    render(<CountdownTimer durationSeconds={600} testIdPrefix="nav" persistKey="t1" />);
    expect(screen.getByTestId('nav-display')).toHaveTextContent('08:00');
    expect(screen.getByTestId('nav-toggle')).toHaveTextContent('Pause');
    sessionStorage.clear();
  });

  it('keeps real time when the browser throttles ticks in a background tab', () => {
    render(<CountdownTimer durationSeconds={600} testIdPrefix="bg" />);
    fireEvent.click(screen.getByTestId('bg-toggle'));
    // Five minutes pass on the clock, but the throttled tab only gets one tick in.
    act(() => {
      vi.setSystemTime(Date.now() + 300_000);
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByTestId('bg-display')).toHaveTextContent('05:00');
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

describe('breathingPatterns', () => {
  it('cycles 4-7-8 through Breathe in (4s), Hold (7s), and Breathe out (8s)', () => {
    expect(getBreathingPhase(0).phase.name).toBe('Breathe in');
    expect(getBreathingPhase(4).phase.name).toBe('Hold');
    expect(getBreathingPhase(11).phase.name).toBe('Breathe out');
    expect(getBreathingPhase(19).phase.name).toBe('Breathe in');
  });

  it('reads the technique from the cope card text', () => {
    expect(pickBreathingPattern('4-7-8 Breathing')).toBe('4-7-8');
    expect(pickBreathingPattern('Box Breathing 4-4-4-4')).toBe('box');
    expect(pickBreathingPattern('Focus Reset Breathing')).toBe('slow');
  });

  it('paces box breathing as four equal sides', () => {
    expect(getBreathingPhase(0, 'box').phase.name).toBe('Breathe in');
    expect(getBreathingPhase(4, 'box').phase.name).toBe('Hold');
    expect(getBreathingPhase(8, 'box').phase.name).toBe('Breathe out');
    expect(getBreathingPhase(12, 'box').phase.name).toBe('Hold');
    expect(getBreathingPhase(16, 'box').phase.name).toBe('Breathe in');
    expect(BREATHING_PATTERNS.box.label).toBe('4-4-4-4');
  });

  it('paces slow breathing as in 4, out 6', () => {
    expect(getBreathingPhase(3, 'slow').phase.name).toBe('Breathe in');
    expect(getBreathingPhase(4, 'slow')).toMatchObject({ phaseRemaining: 6 });
    expect(getBreathingPhase(10, 'slow').phase.name).toBe('Breathe in');
  });
});
