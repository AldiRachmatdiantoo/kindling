import { Flame, HeartHandshake, LogOut, Sparkles, Sun, User } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

const navItems = [
  { to: '/checkin', label: 'Check-In', short: 'Check-In', icon: Sun, testId: 'nav-checkin' },
  { to: '/cope', label: 'Positive Cope', short: 'Cope', icon: HeartHandshake, testId: 'nav-cope' },
  { to: '/wins', label: '3 Daily Wins', short: 'Wins', icon: Sparkles, testId: 'nav-wins' },
  { to: '/profile', label: 'Profil & Heatmap', short: 'Profil', icon: User, testId: 'nav-profile' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="k-wave sticky top-0 z-30 bg-primary">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/wins"
            className="flex items-center gap-2.5 text-white hover:opacity-90"
            data-testid="brand-logo"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-ink bg-lime text-ink">
              <Flame className="h-5 w-5" />
            </span>
            <span className="font-serif text-xl font-bold leading-none">Kindling</span>
          </Link>

          {/*
            A single nav element serves both layouts so every data-testid stays unique:
            a fixed bottom tab bar on mobile, inline pills in the header from md upward.
          */}
          <nav
            aria-label="Navigasi utama"
            className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t-[1.5px] border-ink bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:static md:flex md:items-center md:gap-1 md:border-0 md:bg-transparent md:p-0"
          >
            {navItems.map(({ to, label, short, icon: Icon, testId }) => (
              <NavLink
                key={to}
                to={to}
                data-testid={testId}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 rounded-2xl border-[1.5px] px-2 py-1.5 text-[11px] font-semibold transition-colors md:flex-row md:gap-1.5 md:rounded-full md:px-3.5 md:py-1.5 md:text-sm ${
                    isActive
                      ? 'border-ink bg-lavender text-ink md:bg-lime'
                      : 'border-transparent text-ink-soft hover:bg-primary-soft md:text-white md:hover:bg-white/15'
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                <span className="md:hidden">{short}</span>
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <span
                className="hidden text-sm font-medium text-white/90 lg:inline"
                data-testid="header-user-name"
              >
                {user.full_name}
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              data-testid="logout-button"
              className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-white px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-primary-soft"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-10 pb-28 sm:px-6 md:pb-12">
        <Outlet />
      </main>
    </div>
  );
}
