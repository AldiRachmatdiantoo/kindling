import { Flame, HeartHandshake, LogOut, Sparkles, Sun, User } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

const navItems = [
  { to: '/checkin', label: 'Check-In', icon: Sun, testId: 'nav-checkin' },
  { to: '/cope', label: 'Positive Cope', icon: HeartHandshake, testId: 'nav-cope' },
  { to: '/wins', label: '3 Daily Wins', icon: Sparkles, testId: 'nav-wins' },
  { to: '/profile', label: 'Profil & Heatmap', icon: User, testId: 'nav-profile' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/wins"
            className="flex items-center gap-2 text-stone-900 hover:opacity-85"
            data-testid="brand-logo"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Flame className="h-5 w-5" />
            </span>
            <div>
              <span className="block text-base font-semibold leading-tight">Kindling</span>
              <span className="hidden text-xs text-stone-500 sm:block">
                Small sparks, steady fire.
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Navigasi utama">
            {navItems.map(({ to, label, icon: Icon, testId }) => (
              <NavLink
                key={to}
                to={to}
                data-testid={testId}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors sm:px-3 ${
                    isActive
                      ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <span
                className="hidden text-sm text-stone-600 lg:inline"
                data-testid="header-user-name"
              >
                {user.full_name}
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              data-testid="logout-button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
