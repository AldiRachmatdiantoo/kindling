import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { checkinApi } from '../api/endpoints';
import type { CopeOption } from '../api/types';
import { FocusRoom } from './FocusRoom';

vi.mock('../api/endpoints', () => ({
  checkinApi: { reflect: vi.fn() },
}));
const reflectMock = vi.mocked(checkinApi.reflect);

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

const renderRoom = (o: CopeOption, onClose = vi.fn(), logDate?: string) =>
  render(
    <MemoryRouter>
      <FocusRoom
        option={o}
        persistKey={`test:${o.tool_type}`}
        logDate={logDate}
        onClose={onClose}
      />
    </MemoryRouter>,
  );

const SECRET = 'my manager yelled about the Vexorith report again';

/** Writes SECRET in a brain-dump room tied to a check-in day and folds it away. */
function writeAndFold() {
  renderRoom(option('brain_dump', { title: 'Brain dump' }), vi.fn(), '2026-11-26');
  fireEvent.change(screen.getByTestId('focus-dump-input'), { target: { value: SECRET } });
  fireEvent.click(screen.getByTestId('focus-fold'));
  act(() => vi.advanceTimersByTime(1000));
}

describe('FocusRoom', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    reflectMock.mockReset();
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

  it('guards against duplicate close calls, traps Tab focus, and cleans up timers on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = renderRoom(option('timer'), onClose);

    const closeBtn = screen.getByTestId('focus-room-close');
    const resetBtn = screen.getByTestId('focus-hobby-reset');
    expect(closeBtn).toHaveFocus();

    // Shift+Tab from first focusable wraps to last
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(resetBtn).toHaveFocus();

    // Tab from last focusable wraps to first
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(closeBtn).toHaveFocus();

    // Pressing Escape twice before timer completes only invokes onClose once
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(400));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Unmounting before close timer fires cancels pending callback
    const onClose2 = vi.fn();
    unmount();
    const second = renderRoom(option('brain_dump', { title: 'Brain dump' }), onClose2);
    fireEvent.change(screen.getByTestId('focus-dump-input'), { target: { value: 'hello world' } });
    fireEvent.click(screen.getByTestId('focus-fold'));
    fireEvent.keyDown(window, { key: 'Escape' });
    second.unmount();
    act(() => vi.advanceTimersByTime(1500));
    expect(onClose2).not.toHaveBeenCalled();
  });
  describe('reading a brain dump back', () => {
    it('asks before sending, explains where the text goes, and keeping it private sends nothing', () => {
      writeAndFold();
      expect(screen.getByTestId('focus-reflect-consent')).toHaveTextContent(
        'sends what you wrote to an AI service (Google Gemini) for this one reflection',
      );
      expect(screen.getByTestId('focus-reflect-send')).toHaveAccessibleName('Read it back to me');
      expect(screen.getByTestId('focus-reflect-send')).toHaveAccessibleDescription(
        /isn't saved anywhere/,
      );
      expect(reflectMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('focus-keep-private'));
      expect(reflectMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('focus-archived-note')).toHaveTextContent(
        'Nothing you wrote was saved or sent anywhere.',
      );
      expect(screen.queryByText(new RegExp(SECRET))).not.toBeInTheDocument();
    });

    it('sends the text with consent once, then shows the reflection, themes and the way to wins', async () => {
      reflectMock.mockResolvedValue({
        reflection: 'Work keeps landing on you faster than you can rest.',
        themes: ['Work pressure', 'Running low on rest'],
        safety_flag: false,
      });
      writeAndFold();
      fireEvent.click(screen.getByTestId('focus-reflect-send'));
      expect(screen.getByTestId('focus-reflect-loading')).toBeInTheDocument();
      await act(async () => {});

      expect(reflectMock).toHaveBeenCalledTimes(1);
      expect(reflectMock).toHaveBeenCalledWith('2026-11-26', SECRET, expect.any(String));
      expect(screen.getByTestId('focus-reflection-text')).toHaveTextContent(
        'Work keeps landing on you',
      );
      expect(screen.getAllByTestId('focus-reflection-theme').map((li) => li.textContent)).toEqual([
        'Work pressure',
        'Running low on rest',
      ]);
      expect(screen.queryByTestId('safety-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('focus-reflect-note')).not.toBeInTheDocument();
      expect(screen.getByTestId('focus-go-wins')).toHaveTextContent('On to my 3 Daily Wins');
      expect(screen.getByTestId('focus-go-wins')).toHaveAttribute('href', '/wins');
    });

    it('shows the support banner on safety_flag and explains an ai_note', async () => {
      reflectMock.mockResolvedValue({
        reflection: 'Thank you for trusting this page with something this heavy.',
        themes: [],
        safety_flag: true,
        ai_note: 'daily_limit',
      });
      writeAndFold();
      fireEvent.click(screen.getByTestId('focus-reflect-send'));
      await act(async () => {});

      expect(screen.getByTestId('safety-banner')).toBeInTheDocument();
      expect(screen.getByTestId('focus-reflect-note')).toHaveTextContent(
        "You've used today's AI help",
      );
      expect(screen.queryByTestId('focus-reflection-theme')).not.toBeInTheDocument();
    });

    it('on an error, retries with the same key or continues without a reflection', async () => {
      reflectMock.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'boom'));
      writeAndFold();
      fireEvent.click(screen.getByTestId('focus-reflect-send'));
      await act(async () => {});
      expect(screen.getByTestId('focus-reflect-error')).toHaveTextContent('no reflection yet');

      reflectMock.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'slow down'));
      fireEvent.click(screen.getByTestId('focus-reflect-retry'));
      await act(async () => {});
      expect(screen.getByTestId('focus-reflect-error')).toHaveTextContent('Give it a minute');
      const [first, second] = reflectMock.mock.calls;
      expect(second[2]).toBe(first[2]);

      fireEvent.click(screen.getByTestId('focus-reflect-skip'));
      expect(reflectMock).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('focus-archived-note')).toHaveTextContent(
        'Nothing you wrote was saved.',
      );
      expect(screen.getByTestId('focus-go-wins')).toHaveAttribute('href', '/wins');
    });

    it('has no read-back step without a check-in day', () => {
      renderRoom(option('brain_dump', { title: 'Brain dump' }));
      fireEvent.change(screen.getByTestId('focus-dump-input'), { target: { value: SECRET } });
      fireEvent.click(screen.getByTestId('focus-fold'));
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByTestId('focus-reflect-send')).not.toBeInTheDocument();
      expect(screen.getByTestId('focus-archived')).toBeInTheDocument();
    });
  });
});
