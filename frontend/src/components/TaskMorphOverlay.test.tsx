import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskMorphOverlay, type TaskMorph } from './TaskMorphOverlay';

const base: TaskMorph = {
  id: 1,
  kind: 'slice',
  pillar: 'work',
  from: 'Write the project report',
  to: null,
};

describe('TaskMorphOverlay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays while the request runs, then shows the result and waits for the user', () => {
    const onClose = vi.fn();
    const { rerender } = render(<TaskMorphOverlay morph={base} onClose={onClose} />);
    const dialog = screen.getByTestId('task-morph');
    expect(dialog).toHaveAttribute('data-phase', 'working');
    expect(screen.getByText('Slicing it into one small step...')).toBeInTheDocument();
    expect(screen.queryByTestId('task-morph-close')).not.toBeInTheDocument();

    rerender(
      <TaskMorphOverlay
        morph={{ ...base, to: 'Open the doc and write one heading', label: 'Step 1' }}
        onClose={onClose}
      />,
    );
    expect(dialog).toHaveAttribute('data-phase', 'done');
    expect(screen.getByTestId('task-morph-result')).toHaveTextContent(
      'Step 1Open the doc and write one heading',
    );
    const button = screen.getByTestId('task-morph-close');
    expect(button).toHaveFocus();

    act(() => vi.advanceTimersByTime(30_000));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(button);
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape once the shrunk goal is shown', () => {
    const onClose = vi.fn();
    render(
      <TaskMorphOverlay
        morph={{
          ...base,
          kind: 'shrink',
          from: 'Walk for 20 minutes',
          to: 'Stretch for 2 minutes',
        }}
        onClose={onClose}
      />,
    );
    expect(screen.getByText(/Lighter now/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('says why when a simpler version answered instead of the AI', () => {
    render(
      <TaskMorphOverlay
        morph={{
          ...base,
          to: 'Open the doc',
          label: 'Step 1',
          note: "You've used today's AI help.",
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('task-morph-note')).toHaveTextContent("You've used today's AI help.");
  });

  it('locks body scroll while open, guards duplicate close calls, and traps Tab focus', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <TaskMorphOverlay
        morph={{ ...base, to: 'Open the doc', label: 'Step 1' }}
        onClose={onClose}
      />,
    );
    expect(document.documentElement.style.overflow).toBe('hidden');

    const closeBtn = screen.getByTestId('task-morph-close');
    expect(closeBtn).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(closeBtn).toHaveFocus();

    fireEvent.click(closeBtn);
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });
});
