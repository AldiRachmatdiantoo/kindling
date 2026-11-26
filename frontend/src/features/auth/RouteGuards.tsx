import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

function FullPageLoader() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-stone-50"
      data-testid="auth-loading"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <p className="text-sm text-stone-500">Memuat sesi Kindling...</p>
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
