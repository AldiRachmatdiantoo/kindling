import { ArrowRight, Check, HeartHandshake, Sun, Trophy } from 'lucide-react';
import { m } from 'motion/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { checkinApi } from '../../api/endpoints';
import { KindlingMark } from '../../components/KindlingMark';
import { Mascot } from '../../components/Mascot';
import { clearJustRegistered, isJustRegistered } from '../../utils/justRegistered';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from '../theme/ThemeToggle';
import { Button } from '@/components/watermelon-ui/button';
import { Card } from '@/components/ui/card';

/** Where today's check-in stands: still loading, open, or already answered. */
type TodayState = 'loading' | 'open' | 'done';

const STEPS = [
  {
    icon: Sun,
    title: 'Check in',
    body: '9 quick questions, about 2 minutes. There are no wrong answers.',
  },
  {
    icon: HeartHandshake,
    title: 'Recharge',
    body: 'Pick one short recovery moment: breathing, a hobby timer, or a brain dump.',
  },
  {
    icon: Trophy,
    title: 'Three small wins',
    body: 'One small goal each for your body, your work, and your heart, sized to today.',
  },
];

/**
 * The first screen after signing up or signing in: Ember says hello, shows how a day in
 * Kindling goes, then hands the user to today's check-in (or to their wins when today is
 * already answered). Register passes { isNew: true } in the route state.
 */
export function WelcomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isNew] = useState(
    () => (location.state as { isNew?: boolean } | null)?.isNew === true || isJustRegistered(),
  );
  // The greeting is decided; a later visit to this screen says "Welcome back".
  useEffect(() => clearJustRegistered(), []);
  const [today, setToday] = useState<TodayState>('loading');

  useEffect(() => {
    let active = true;
    checkinApi
      .getToday()
      .then(() => active && setToday('done'))
      // 404 means not checked in yet. Any other failure still offers the check-in, which
      // reports its own errors, rather than stranding the user on this screen.
      .catch(() => active && setToday('open'));
    return () => {
      active = false;
    };
  }, []);

  const firstName = user?.full_name?.trim().split(/\s+/)[0] ?? '';
  const done = today === 'done';

  const title = isNew
    ? `Welcome to Kindling${firstName ? `, ${firstName}` : ''}!`
    : `Welcome back${firstName ? `, ${firstName}` : ''}`;
  const lead = done
    ? "You've already checked in today, so your wins are ready and waiting."
    : isNew
      ? "Here a good day is sized to the energy you actually have. No streaks, no pressure. I'm Ember, and I'll walk you through it."
      : "Let's see how much energy you've got today, then size the day to match.";

  const startCheckin = () => navigate('/checkin', { replace: true });

  return (
    <main className="min-h-screen bg-cream px-4 pt-6 pb-12" data-testid="welcome-page">
      <div className="mx-auto flex max-w-xl items-center justify-between">
        <span className="flex items-center gap-2.5 text-ink">
          <KindlingMark />
          <span className="font-serif text-xl leading-none font-bold">Kindling</span>
        </span>
        <ThemeToggle />
      </div>

      <div className="mx-auto mt-10 max-w-xl text-center">
        <m.div
          initial={{ scale: 0.6, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mb-4 flex justify-center"
        >
          <Mascot mood={done ? 'happy' : 'cheer'} className="h-28 w-24" />
        </m.div>
        <h1
          className="text-3xl font-bold tracking-tight text-ink sm:text-4xl"
          data-testid="welcome-title"
        >
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft sm:text-base">
          {lead}
        </p>
      </div>

      <Card className="mx-auto mt-8 max-w-xl p-5 sm:p-6">
        <h2 className="text-xs font-semibold text-ink-faint">How today goes</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map(({ icon: Icon, title: stepTitle, body }, i) => {
            const isCheckin = i === 0;
            const current = isCheckin && !done;
            return (
              <m.li
                key={stepTitle}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.09, type: 'spring', stiffness: 300, damping: 26 }}
                className={`flex items-start gap-3.5 rounded-2xl border px-4 py-3.5 ${
                  current ? 'border-primary bg-primary-soft' : 'border-line bg-surface-2'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    isCheckin && done ? 'bg-mint-strong text-surface' : 'bg-surface text-ink'
                  }`}
                  aria-hidden="true"
                >
                  {isCheckin && done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-base font-bold text-ink">
                      {i + 1}. {stepTitle}
                    </span>
                    {current && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                        Start here
                      </span>
                    )}
                    {isCheckin && done && (
                      <span className="text-[11px] font-semibold text-mint-strong">Done today</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-ink-soft">{body}</span>
                </span>
              </m.li>
            );
          })}
        </ol>

        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          {today === 'loading' ? (
            <div
              className="flex min-h-11 items-center justify-center gap-2 text-sm text-ink-soft"
              data-testid="welcome-loading"
            >
              <span className="k-spinner h-5 w-5" aria-hidden="true" />
              Getting your day ready...
            </div>
          ) : done ? (
            <Button
              onClick={() => navigate('/wins', { replace: true })}
              data-testid="welcome-to-wins"
            >
              Go to my 3 Daily Wins
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button onClick={startCheckin} data-testid="welcome-start">
              Start today's check-in
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </Card>
    </main>
  );
}
