import { CalendarCheck, HeartHandshake, LogOut, Sun, Trophy, User } from 'lucide-react';
import { useEffect, useLayoutEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { WelcomeTourProvider } from '../features/onboarding/WelcomeTour';
import { ThemeToggle } from '../features/theme/ThemeToggle';
import { TodayStatusProvider, useTodayStatus } from '../features/today/TodayStatus';
import { KindlingMark } from './KindlingMark';
import { Button } from '@/components/watermelon-ui/button';

export function AppShell() {
  return (
    <TodayStatusProvider>
      <AppShellLayout />
    </TodayStatusProvider>
  );
}

function AppShellLayout() {
  const { user, logout } = useAuth();
  const { status, mood } = useTodayStatus();
  const navigate = useNavigate();
  const location = useLocation();

  // Once today's check-in exists the wizard is locked, so the first tab becomes the
  // day overview instead of a dead end. `short` is for the mobile bar and tablet widths
  // (the full label would wrap there); `label` appears from lg upward.
  const firstTab =
    status === 'done'
      ? { label: 'Today', short: 'Today', icon: CalendarCheck }
      : { label: 'Check-In', short: 'Check-In', icon: Sun };
  const navItems = [
    { to: '/checkin', ...firstTab, testId: 'nav-checkin' },
    {
      to: '/cope',
      label: 'Positive Cope',
      short: 'Cope',
      icon: HeartHandshake,
      testId: 'nav-cope',
    },
    {
      to: '/wins',
      label: '3 Daily Wins',
      short: 'Wins',
      icon: Trophy,
      testId: 'nav-wins',
    },
    {
      to: '/profile',
      label: 'Profile & Heatmap',
      short: 'Profile',
      icon: User,
      testId: 'nav-profile',
    },
  ];

  // The welcome tour waits until the user reaches the dashboard, never mid check-in.
  const canAutoStart =
    status !== 'unknown' && (location.pathname !== '/checkin' || status === 'done');
  const firstName = user?.full_name?.trim().split(/\s+/)[0] ?? '';

  // Adaptive atmosphere: today's energy mode tints the whole app (see the mood block in
  // index.css). Signed-out pages never carry it.
  useEffect(() => {
    const root = document.documentElement;
    if (mood) root.dataset.mood = mood;
    else delete root.dataset.mood;
    return () => {
      delete root.dataset.mood;
    };
  }, [mood]);

  // A new tab starts at its top, not wherever the previous page was scrolled to.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <WelcomeTourProvider
      userId={user?.id ?? null}
      firstName={firstName}
      canAutoStart={canAutoStart}
    >
      <div className="min-h-screen bg-cream text-ink">
        <a
          href="#content"
          className="sr-only z-50 rounded-full border border-line bg-lime px-4 py-2 text-sm font-bold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>

        <header className="k-wave sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <Link
              to="/"
              className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-full text-ink hover:opacity-90"
              data-testid="brand-logo"
            >
              <KindlingMark />
              <span className="font-serif text-xl leading-none font-bold">Kindling</span>
            </Link>

            {/*
            One nav element serves both layouts so every data-testid stays unique:
            a fixed bottom tab bar below md, inline pills in the header from md upward.
          */}
            <nav
              aria-label="Main navigation"
              className="k-nav-surface fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-line bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:static md:flex md:items-center md:gap-1 md:border-0 md:bg-transparent md:p-0"
            >
              {navItems.map(({ to, label, short, icon: Icon, testId }) => (
                <NavLink
                  key={to}
                  to={to}
                  data-testid={testId}
                  className={({ isActive }) =>
                    `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors duration-200 md:min-h-10 md:flex-row md:gap-1.5 md:rounded-full md:px-3 md:py-1.5 md:text-sm lg:px-3.5 ${
                      isActive
                        ? 'border-primary bg-primary-soft text-ink'
                        : 'border-transparent text-ink-soft hover:bg-surface-2 hover:text-ink'
                    }`
                  }
                >
                  <Icon className="h-5 w-5 shrink-0 md:h-4 md:w-4" aria-hidden="true" />
                  <span className="lg:hidden">{short}</span>
                  <span className="hidden lg:inline">{label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              {user && (
                <span
                  className="hidden max-w-40 truncate text-sm font-medium text-ink-soft xl:inline"
                  data-testid="header-user-name"
                >
                  {user.full_name}
                </span>
              )}
              <ThemeToggle />
              <Button
                variant="secondary"
                onClick={handleLogout}
                data-testid="logout-button"
                aria-label="Sign out"
                className="min-w-11 gap-1.5 px-3 font-semibold"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </header>

        <main id="content" className="mx-auto max-w-6xl px-4 pt-10 pb-28 sm:px-6 md:pb-12">
          {/* Keyed by path so each route change replays the settle-in animation. */}
          <div key={location.pathname} className="k-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </WelcomeTourProvider>
  );
}
