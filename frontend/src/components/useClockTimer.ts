import { useCallback, useEffect, useState } from 'react';

interface TimerState {
  running: boolean;
  /** Clock time the current run started, adjusted for time already done. Only while running. */
  startAt: number;
  /** Whole seconds done when paused. */
  elapsed: number;
}

const IDLE: TimerState = { running: false, startAt: 0, elapsed: 0 };
const TIMER_PREFIX = 'kindling:timer:';
const storageKey = (key: string) => `${TIMER_PREFIX}${key}`;

/** Removes all persisted timers belonging to a specific user from sessionStorage. */
export function clearUserTimers(userId: string): void {
  if (!userId) return;
  const userPrefix = `${TIMER_PREFIX}${userId}:`;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(userPrefix)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing to clear.
  }
}

function load(key: string | undefined, duration: number): TimerState {
  if (!key) return IDLE;
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return IDLE;
    const saved = JSON.parse(raw) as TimerState & { duration: number };
    // A different length means a different activity under the same key: start fresh.
    if (saved.duration !== duration) return IDLE;
    return { running: !!saved.running, startAt: saved.startAt || 0, elapsed: saved.elapsed || 0 };
  } catch {
    return IDLE;
  }
}

function save(key: string | undefined, duration: number, state: TimerState) {
  if (!key) return;
  try {
    if (!state.running && state.elapsed === 0) sessionStorage.removeItem(storageKey(key));
    else sessionStorage.setItem(storageKey(key), JSON.stringify({ ...state, duration }));
  } catch {
    // Storage full or blocked: the timer still works, it just won't survive a page change.
  }
}

/**
 * A timer measured against the clock, so a throttled background tab can't slow it down.
 * With a `persistKey` it also keeps going while its page is closed: leave for another tab,
 * come back, and it shows the time that really passed.
 */
export function useClockTimer(duration: number, persistKey?: string) {
  const [state, setState] = useState<TimerState>(() => load(persistKey, duration));
  const [now, setNow] = useState(() => Date.now());

  // A new activity (another key or length) loads its own saved state.
  useEffect(() => {
    setState(load(persistKey, duration));
    setNow(Date.now());
  }, [persistKey, duration]);

  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state.running]);

  const elapsed = state.running
    ? Math.min(duration, Math.max(0, Math.floor((now - state.startAt) / 1000)))
    : Math.min(duration, state.elapsed);

  const update = useCallback(
    (next: TimerState) => {
      setState(next);
      setNow(Date.now());
      save(persistKey, duration, next);
    },
    [persistKey, duration],
  );

  // Reaching the end stops the run and keeps it marked as finished.
  useEffect(() => {
    if (state.running && elapsed >= duration) {
      update({ running: false, startAt: 0, elapsed: duration });
    }
  }, [state.running, elapsed, duration, update]);

  const start = useCallback(() => {
    const from = elapsed >= duration ? 0 : elapsed;
    update({ running: true, startAt: Date.now() - from * 1000, elapsed: from });
  }, [elapsed, duration, update]);

  const pause = useCallback(() => {
    update({ running: false, startAt: 0, elapsed });
  }, [elapsed, update]);

  const reset = useCallback(() => update(IDLE), [update]);

  return { elapsed, running: state.running, start, pause, reset };
}
