import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AuthProvider } from './features/auth/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { GuestRoute, ProtectedRoute } from './features/auth/RouteGuards';
import { CheckinPage } from './features/checkin/CheckinPage';
import { CopePage } from './features/cope/CopePage';
import { HomeRedirect } from './features/home/HomeRedirect';
import { ProfilePage } from './features/profile/ProfilePage';
import { WinsPage } from './features/wins/WinsPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route element={<AppShell />}>
              <Route path="/checkin" element={<CheckinPage />} />
              <Route path="/cope" element={<CopePage />} />
              <Route path="/wins" element={<WinsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
