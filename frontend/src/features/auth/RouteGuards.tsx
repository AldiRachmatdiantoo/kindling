import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Button } from '@/components/watermelon-ui/button';

function FullPageLoader() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-cream"
      data-testid="auth-loading"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="k-spinner" />
        <p className="text-sm text-ink-soft">Loading your Kindling session...</p>
      </div>
    </div>
  );
}

function SessionUnreachable() {
  const { refreshUser } = useAuth();
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div
        className="k-error max-w-md p-6 text-center"
        role="alert"
        data-testid="session-unreachable"
      >
        <p className="font-semibold">Kindling can't reach the server right now.</p>
        <p className="mt-1 text-sm">
          We couldn't check your session just now. Give it a moment, then try again.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await refreshUser();
            setRetrying(false);
          }}
        >
          {retrying ? 'Trying...' : 'Try again'}
        </Button>
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const { user, loading, unreachable } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageLoader />;
  }

  if (!user && unreachable) {
    return <SessionUnreachable />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullPageLoader />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
