import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CopeOption } from '../api/types';
import { FocusRoom } from './FocusRoom';

const option = (
  tool_type: CopeOption['tool_type'],
  extra: Partial<CopeOption> = {},
): CopeOption => ({
  id: 'cope_1',
  title: 'Play guitar for 10 minutes',
  brief_cope_category: 'self_distraction',
  tool_type,
  duration_seconds: 600,
  guidance: 'Pick any song you like.',
  ...extra,
});

const renderRoom = (o: CopeOption, onClose = vi.fn()) =>
  render(
    <MemoryRouter>
      <FocusRoom option={o} persistKey={`test:${o.tool_type}`} onClose={onClose} />
    </MemoryRouter>,
  );

describe('FocusRoom', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('gives a hobby explicit permission to be unproductive, and the timer runs', () => {
    renderRoom(option('timer'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('focus-permission')).toHaveTextContent(
      'This time is yours. No need to be productive for the next 10 minutes.',
    );
    fireEvent.click(screen.getByTestId('focus-hobby-toggle'));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('focus-hobby-remaining')).toHaveTextContent('09:57');
  });

  it('folds a brain dump away, keeps none of the text, and points to the wins', () => {
    renderRoom(option('brain_dump', { title: 'Brain dump' }));
    const input = screen.getByTestId('focus-dump-input');
    fireEvent.change(input, { target: { value: 'too many deadlines and no sleep at all' } });
    fireEvent.click(screen.getByTestId('focus-fold'));
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByTestId('focus-archived')).toHaveTextContent('Even a few words count');
    expect(screen.queryByText(/too many deadlines/)).not.toBeInTheDocument();
    expect(screen.getByTestId('focus-go-wins')).toHaveAttribute('href', '/wins');
  });

  it('starts the breathing orb on the in-breath and closes on Escape', () => {
    const onClose = vi.fn();
    renderRoom(option('breathing', { title: '4-7-8 Breathing', duration_seconds: 120 }), onClose);
    expect(screen.getByTestId('focus-breathing-phase')).toHaveTextContent('Ready');
    fireEvent.click(screen.getByTestId('focus-breathing-toggle'));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByTestId('focus-breathing-phase')).toHaveTextContent('Breathe in');

    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(400));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
