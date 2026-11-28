import { CalendarCheck, HeartHandshake, Lock, LogOut, Sun, Trophy, User } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { WelcomeTourProvider } from '../features/onboarding/WelcomeTour';
import { useAtmosphereSync } from '../features/theme/atmosphere';
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
  // (the full label would wrap there); `label` appears from lg upward, in the sidebar.
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

  // Until today's questions are answered, the other tabs stay locked: the check-in is the
  // one thing to do first, and the pages behind them are built from its answers.
  const navLocked = status === 'open';

  // The welcome tour shows the day the check-in built, so it waits until that day exists.
  const canAutoStart = status === 'done';
  const firstName = user?.full_name?.trim().split(/\s+/)[0] ?? '';

  // Adaptive atmosphere: today's tier tints the accent and paces the motion (the atmosphere
  // block in index.css). Signed-out pages never carry it.
  useAtmosphereSync(mood, status, user?.timezone || 'Asia/Jakarta');

  // A new tab starts at its top, not wherever the previous page was scrolled to. Below md
  // the page scrolls inside scrollRef, from md up the window does.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [location.pathname]);

  // Where the nav's active pill sits: the active link's box, relative to the nav. Measured
  // again on every route change and whenever the nav or a link resizes (breakpoint, font
  // load, the first tab's label switching between Check-In and Today).
  const navRef = useRef<HTMLElement>(null);
  // Reduced motion only drops transforms by default, which would snap x but still stretch
  // the width; move the whole pill instantly instead.
  const reduceMotion = useReducedMotion();
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('a[aria-current="page"]');
      // No active tab for a moment (a redirect in flight): keep the pill where it was, so it
      // slides on from there instead of unmounting and popping back without motion.
      if (!active) return;
      setPill({
        x: active.offsetLeft,
        y: active.offsetTop,
        w: active.offsetWidth,
        h: active.offsetHeight,
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    nav.querySelectorAll('a').forEach((a) => ro.observe(a));
    return () => ro.disconnect();
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

        {/*
          Three layouts from one header, so every data-testid stays unique: a top bar with a
          bottom tab bar below md, a top bar with inline pills from md, and from lg a fixed
          sidebar on the left (brand, nav, then the account at the bottom), like a desktop app.
          Blur only between md and lg: backdrop-filter makes the header the containing block
          for fixed children, which would pin the mobile bottom nav to the header instead.
        */}
        <header className="k-wave sticky top-0 shrink-0 z-30 border-b border-line bg-cream md:bg-cream/90 md:backdrop-blur-md lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:border-r lg:border-b-0 lg:bg-surface lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:h-full lg:max-w-none lg:flex-col lg:items-stretch lg:justify-start lg:gap-6 lg:px-3 lg:py-5">
            <Link
              to="/"
              className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-full text-ink hover:opacity-90 lg:px-3"
              data-testid="brand-logo"
            >
              <KindlingMark />
              <span className="font-serif text-xl leading-none font-bold">Kindling</span>
            </Link>

            {/*
            One nav element serves every layout so each data-testid stays unique: a fixed
            bottom tab bar below md, inline pills from md, a vertical list in the lg sidebar.
          */}
            <nav
              ref={navRef}
              aria-label="Main navigation"
              className="k-nav-surface fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-line bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:relative md:flex md:items-center md:gap-1 md:border-0 md:bg-transparent md:p-0 lg:flex-col lg:items-stretch"
            >
              {/*
                Watermelon "Fluid Tabs": one pill that springs from tab to tab. Its place comes
                from the active link's offset inside the nav, so a page scroll (or the scroll
                reset on a route change) never bends the slide the way a shared layoutId did.
              */}
              {pill && (
                <m.span
                  aria-hidden="true"
                  initial={false}
                  animate={{ x: pill.x, y: pill.y, width: pill.w, height: pill.h }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }
                  }
                  className="pointer-events-none absolute top-0 left-0 rounded-2xl border border-primary bg-primary-soft md:rounded-full lg:rounded-2xl"
                  data-testid="nav-active-pill"
                />
              )}
              {navItems.map(({ to, label, short, icon: Icon, testId }) =>
                navLocked && to !== '/checkin' ? (
                  <span
                    key={to}
                    role="link"
                    aria-disabled="true"
                    title="Answer today's check-in first"
                    data-testid={testId}
                    data-locked="true"
                    className="relative flex min-h-12 cursor-not-allowed flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-ink-faint md:min-h-10 md:flex-row md:gap-1.5 md:rounded-full md:px-3 md:py-1.5 md:text-sm lg:min-h-11 lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-3 lg:py-2.5 lg:text-[15px]"
                  >
                    <span className="relative flex">
                      <Icon
                        className="h-5 w-5 shrink-0 opacity-60 md:h-4 md:w-4 lg:h-5 lg:w-5"
                        aria-hidden="true"
                      />
                      <Lock
                        className="absolute -right-1.5 -bottom-1 h-3 w-3 rounded-full bg-surface lg:hidden"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="relative lg:hidden">{short}</span>
                    <span className="relative hidden lg:inline">{label}</span>
                    <Lock className="ml-auto hidden h-3.5 w-3.5 lg:block" aria-hidden="true" />
                    <span className="sr-only">(locked until today's check-in)</span>
                  </span>
                ) : (
                  <NavLink
                    key={to}
                    to={to}
                    data-testid={testId}
                    className={({ isActive }) =>
                      `relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors duration-200 md:min-h-10 md:flex-row md:gap-1.5 md:rounded-full md:px-3 md:py-1.5 md:text-sm lg:min-h-11 lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-3 lg:py-2.5 lg:text-[15px] ${
                        isActive ? 'text-ink' : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <m.span
                          animate={{ scale: isActive ? 1.1 : 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                          className="relative flex"
                        >
                          <Icon
                            className="h-5 w-5 shrink-0 md:h-4 md:w-4 lg:h-5 lg:w-5"
                            aria-hidden="true"
                          />
                        </m.span>
                        <span className="relative lg:hidden">{short}</span>
                        <span className="relative hidden lg:inline">{label}</span>
                      </>
                    )}
                  </NavLink>
                ),
              )}
            </nav>

            {navLocked && (
              <p
                className="hidden px-3 text-xs leading-relaxed text-ink-soft lg:block"
                data-testid="nav-locked-hint"
              >
                Answer today's check-in first. The rest opens right after.
              </p>
            )}

            {/* In the sidebar the account sits at the bottom: the name, then theme and sign out. */}
            <div className="flex shrink-0 items-center gap-2 lg:mt-auto lg:flex-wrap lg:border-t lg:border-line lg:px-1 lg:pt-4">
              {user && (
                <span
                  className="hidden max-w-40 truncate text-sm font-medium text-ink-soft lg:block lg:max-w-none lg:basis-full lg:px-2"
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
                className="min-w-11 gap-1.5 px-3 font-semibold lg:flex-1"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] md:overflow-visible lg:pl-60"
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
