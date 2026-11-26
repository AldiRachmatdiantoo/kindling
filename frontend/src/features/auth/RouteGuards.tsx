import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

function FullPageLoader() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-cream"
      data-testid="auth-loading"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="k-spinner" />
        <p className="text-sm text-ink-soft">Memuat sesi Kindling...</p>
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageLoader />;
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
    return <Navigate to="/checkin" replace />;
  }

  return <Outlet />;
}
