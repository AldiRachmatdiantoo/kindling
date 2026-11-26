import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import type { CalibrationTier, DailyLog } from '../../api/types';

/**
 * Whether today's check-in exists, shared so the navbar can relabel the Check-In tab
 * to "Today" once it does. The shell asks once on mount; pages that already fetch
 * today's log report what they learn, so navigation adds no extra requests.
 */
export type TodayCheckinStatus = 'unknown' | 'open' | 'done';

interface TodayStatusValue {
  status: TodayCheckinStatus;
  setStatus: (status: TodayCheckinStatus) => void;
  /** Today's energy mode once known; the shell tints the whole app with it. */
  mood: CalibrationTier | null;
  /** Pages that load or create today's log report it here: status and mood in one go. */
  reportLog: (log: DailyLog) => void;
}

const TodayStatusContext = createContext<TodayStatusValue | null>(null);

export function TodayStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TodayCheckinStatus>('unknown');
  const [mood, setMood] = useState<CalibrationTier | null>(null);
  const reportLog = useCallback((log: DailyLog) => {
    setStatus('done');
    setMood(log.calibration_tier);
  }, []);

  useEffect(() => {
    let active = true;
    checkinApi
      .getToday()
      .then((log) => {
        if (!active) return;
        setStatus((prev) => (prev === 'unknown' ? 'done' : prev));
        setMood((prev) => prev ?? log.calibration_tier);
      })
      .catch((err) => {
        if (active && err instanceof ApiError && err.status === 404) {
          setStatus((prev) => (prev === 'unknown' ? 'open' : prev));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <TodayStatusContext.Provider value={{ status, setStatus, mood, reportLog }}>
      {children}
    </TodayStatusContext.Provider>
  );
}

const NOOP_VALUE: TodayStatusValue = {
  status: 'unknown',
  setStatus: () => undefined,
  mood: null,
  reportLog: () => undefined,
};

export function useTodayStatus(): TodayStatusValue {
  // Pages rendered outside the shell (e.g. in isolated tests) get a harmless no-op.
  return useContext(TodayStatusContext) ?? NOOP_VALUE;
}
