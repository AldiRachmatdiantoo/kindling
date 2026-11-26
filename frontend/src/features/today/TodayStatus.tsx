import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { checkinApi } from '../../api/endpoints';

/**
 * Whether today's check-in exists, shared so the navbar can relabel the Check-In tab
 * to "Today" once it does. The shell asks once on mount; pages that already fetch
 * today's log report what they learn, so navigation adds no extra requests.
 */
export type TodayCheckinStatus = 'unknown' | 'open' | 'done';

interface TodayStatusValue {
  status: TodayCheckinStatus;
  setStatus: (status: TodayCheckinStatus) => void;
}

const TodayStatusContext = createContext<TodayStatusValue | null>(null);

export function TodayStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TodayCheckinStatus>('unknown');

  useEffect(() => {
    let active = true;
    checkinApi
      .getToday()
      .then(() => {
        if (active) setStatus((prev) => (prev === 'unknown' ? 'done' : prev));
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
    <TodayStatusContext.Provider value={{ status, setStatus }}>{children}</TodayStatusContext.Provider>
  );
}

const NOOP_VALUE: TodayStatusValue = { status: 'unknown', setStatus: () => undefined };

export function useTodayStatus(): TodayStatusValue {
  // Pages rendered outside the shell (e.g. in isolated tests) get a harmless no-op.
  return useContext(TodayStatusContext) ?? NOOP_VALUE;
}
