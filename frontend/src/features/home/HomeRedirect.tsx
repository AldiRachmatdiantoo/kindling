import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import { useAuth } from '../auth/AuthContext';

/**
 * Decides where "/" lands: the wizard while today's check-in is still open, otherwise the
 * 3 Daily Wins dashboard.
 */
export function HomeRedirect() {
  const { user } = useAuth();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    checkinApi
      .getToday()
      .then(() => {
        if (active) setTarget('/wins');
      })
      .catch((err) => {
        if (!active) return;
        const notCheckedIn = err instanceof ApiError && err.status === 404;
        setTarget(notCheckedIn ? '/checkin' : '/wins');
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (!target) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-cream"
        data-testid="home-loading"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="k-spinner" />
          <p className="text-sm text-ink-soft">Getting your day ready...</p>
        </div>
      </div>
    );
  }

  return <Navigate to={target} replace />;
}
