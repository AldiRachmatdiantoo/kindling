import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { PageLoading } from './components/PageLoading';
import { AuthProvider } from './features/auth/AuthContext';
import { GuestRoute, ProtectedRoute } from './features/auth/RouteGuards';
import { HomeRedirect } from './features/home/HomeRedirect';

const LoginPage = lazy(() =>
  import('./features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('./features/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const CheckinPage = lazy(() =>
  import('./features/checkin/CheckinPage').then((m) => ({ default: m.CheckinPage })),
);
const CopePage = lazy(() =>
  import('./features/cope/CopePage').then((m) => ({ default: m.CopePage })),
);
const WinsPage = lazy(() =>
  import('./features/wins/WinsPage').then((m) => ({ default: m.WinsPage })),
);
const WelcomePage = lazy(() =>
  import('./features/onboarding/WelcomePage').then((m) => ({ default: m.WelcomePage })),
);
const ProfilePage = lazy(() =>
  import('./features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoading testId="route-loading" />}>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/welcome" element={<WelcomePage />} />
              <Route element={<AppShell />}>
                <Route path="/checkin" element={<CheckinPage />} />
                <Route path="/cope" element={<CopePage />} />
                <Route path="/wins" element={<WinsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
