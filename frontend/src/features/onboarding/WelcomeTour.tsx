import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Pillar } from '../../api/types';
import { Mascot, PILLAR_MASCOT, type MascotMood } from '../../components/Mascot';
import { MascotDialog } from '../../components/MascotDialog';
import { Button } from '@/components/watermelon-ui/button';

const storageKey = (userId: string) => `kindling:welcome-done:${userId}`;

function hasSeenTour(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return true; // Storage blocked: never trap the user in a tour that cannot be dismissed.
  }
}

function markTourSeen(userId: string) {
  try {
    localStorage.setItem(storageKey(userId), '1');
  } catch {
    // Ignored: the tour simply shows again next time.
  }
}

interface TourStep {
  title: string;
  body: ReactNode;
  mood: MascotMood;
}

const PILLARS: Pillar[] = ['physical', 'work', 'soul'];

function buildSteps(firstName: string): TourStep[] {
  return [
    {
      title: `Hey ${firstName || 'there'}, welcome to Kindling!`,
      mood: 'cheer',
      body: (
        <p>
          I'm Ember. Around here we don't chase big goals. A better life gets built from small steps
          that fit the energy you actually have today. Let me show you how it works. It only takes a
          minute.
        </p>
      ),
    },
    {
      title: '1. Check in every day',
      mood: 'happy',
      body: (
        <p>
          Nine quick questions help me read your energy. Then I pick how big your goals should be:
          Gentle when you're worn out, Balanced when you're doing okay, Standard when you're ready
          to go.
        </p>
      ),
    },
    {
      title: '2. Recharge first, then go',
      mood: 'calm',
      body: (
        <p>
          Positive Cope has 3 short recovery moments for you: a breathing exercise, a rest timer, or
          a quick brain dump. Pick one before you dive into work.
        </p>
      ),
    },
    {
      title: '3. Three small wins',
      mood: 'happy',
      body: (
        <>
          <p>
            Every day you get one small goal for your body, your work, and your heart. Meet my
            friends who'll cheer you on:
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {PILLARS.map((pillar) => (
              <li key={pillar} className="flex flex-col items-center text-center">
                <Mascot pillar={pillar} mood="happy" className="h-16 w-14" />
                <span className="text-xs font-bold text-ink">{PILLAR_MASCOT[pillar].name}</span>
                <span className="text-[11px] text-ink-soft">
                  {pillar === 'physical' ? 'body' : pillar === 'work' ? 'work' : 'heart'}
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      title: 'Too much? Make it smaller',
      mood: 'calm',
      body: (
        <p>
          Tap &ldquo;Still too heavy&rdquo; on any win and I'll shrink it. Got a big work task? The
          Task Slicer turns it into one 5 to 10 minute step. And resting is always a valid choice.
        </p>
      ),
    },
    {
      title: 'Watch your trail grow',
      mood: 'happy',
      body: (
        <p>
          Your profile shows a heatmap of your days. There are no streaks to break, so nothing is
          lost if you take a day off. Ready when you are!
        </p>
      ),
    },
  ];
}

interface WelcomeTourValue {
  /** Opens the tour from the first step, e.g. from "Replay the tour" on the profile. */
  openTour: () => void;
  /** True while the welcome tour dialog is open, so empty-state mascots can step back. */
  isOpen: boolean;
}

const WelcomeTourContext = createContext<WelcomeTourValue>({
  openTour: () => {},
  isOpen: false,
});

export function useWelcomeTour(): WelcomeTourValue {
  return useContext(WelcomeTourContext);
}

export interface WelcomeTourProviderProps {
  userId: string | null;
  firstName: string;
  /** False while the user is in the check-in wizard: the tour waits for the dashboard. */
  canAutoStart: boolean;
  children: ReactNode;
}

/**
 * First-visit welcome: Ember explains how Kindling works in six short steps, once per
 * user, the first time they reach the dashboard. Skippable at any step and replayable.
 */
export function WelcomeTourProvider({
  userId,
  firstName,
  canAutoStart,
  children,
}: WelcomeTourProviderProps) {
  const [step, setStep] = useState<number | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const steps = useMemo(() => buildSteps(firstName), [firstName]);

  useEffect(() => {
    if (userId && canAutoStart && !hasSeenTour(userId)) setStep(0);
  }, [userId, canAutoStart]);

  const close = useCallback(() => {
    if (userId) markTourSeen(userId);
    setStep(null);
  }, [userId]);

  const isOpen = step !== null;
  const value = useMemo(() => ({ openTour: () => setStep(0), isOpen }), [isOpen]);
  const current = step === null ? null : steps[step];
  const isLast = step === steps.length - 1;

  return (
    <WelcomeTourContext.Provider value={value}>
      {children}
      {current && step !== null && (
        <MascotDialog
          onClose={close}
          title={current.title}
          titleId="welcome-title"
          mood={current.mood}
          initialFocusRef={nextRef}
          stepKey={step}
          testId="welcome-tour"
          corner={
            <span className="flex items-center gap-1">
              <span className="text-xs font-semibold text-ink-soft" data-testid="welcome-step">
                {step + 1}/{steps.length}
              </span>
              {!isLast && (
                <Button variant="ghost" onClick={close} className="px-3" data-testid="welcome-skip">
                  Skip
                </Button>
              )}
            </span>
          }
          actions={
            <>
              {step > 0 && (
                <Button onClick={() => setStep(step - 1)} variant="secondary">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
              )}
              <Button
                ref={nextRef}
                onClick={() => (isLast ? close() : setStep(step + 1))}
                data-testid="welcome-next"
              >
                {isLast ? "Let's start" : 'Next'}
                {!isLast && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </>
          }
        >
          {current.body}
        </MascotDialog>
      )}
    </WelcomeTourContext.Provider>
  );
}
