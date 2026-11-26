import { CalendarCheck, HeartHandshake, LogOut, Sun, Trophy, User } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { m } from 'motion/react';
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

  // A new tab starts at its top, not wherever the previous page was scrolled to. Below md
  // the page scrolls inside scrollRef, from md up the window does.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    scrollRef.current?.scrollTo?.(0, 0);
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
      {/*
        Below md the document itself never scrolls: the shell is one screen tall and the
        content scrolls inside it. iOS Safari draws page content behind its floating toolbar
        and refuses to paint fixed elements there, so a scrolling document would show through
        under the tab bar. With nothing scrolling, that strip shows the html background,
        which index.css paints in the tab bar's color.
      */}
      <div className="k-app flex h-dvh flex-col bg-cream text-ink md:block md:h-auto md:min-h-screen">
        <a
          href="#content"
          className="sr-only z-50 rounded-full border border-line bg-lime px-4 py-2 text-sm font-bold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>

        {/* Blur only from md up: backdrop-filter makes the header the containing block for
            fixed children, which would pin the mobile bottom nav to the header instead. */}
        <header className="k-wave sticky top-0 shrink-0 z-30 border-b border-line bg-cream md:bg-cream/90 md:backdrop-blur-md">
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
                    `relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors duration-200 md:min-h-10 md:flex-row md:gap-1.5 md:rounded-full md:px-3 md:py-1.5 md:text-sm lg:px-3.5 ${
                      isActive ? 'text-ink' : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Watermelon "Fluid Tabs": one pill that springs from tab to tab. */}
                      {isActive && (
                        <m.span
                          layoutId="nav-active-pill"
                          transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}
                          className="absolute inset-0 rounded-2xl border border-primary bg-primary-soft md:rounded-full"
                          aria-hidden="true"
                        />
                      )}
                      <m.span
                        animate={{ scale: isActive ? 1.1 : 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                        className="relative flex"
                      >
                        <Icon className="h-5 w-5 shrink-0 md:h-4 md:w-4" aria-hidden="true" />
                      </m.span>
                      <span className="relative lg:hidden">{short}</span>
                      <span className="relative hidden lg:inline">{label}</span>
                    </>
                  )}
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

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] md:overflow-visible"
        >
          <main id="content" className="mx-auto max-w-6xl px-4 pt-10 pb-28 sm:px-6 md:pb-12">
            {/* Keyed by path so each route change replays the settle-in animation. */}
            <div key={location.pathname} className="k-enter">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </WelcomeTourProvider>
  );
}
