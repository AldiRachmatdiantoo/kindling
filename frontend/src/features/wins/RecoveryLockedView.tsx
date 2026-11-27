import { HeartHandshake, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Mascot } from '../../components/Mascot';
import { MascotBubble } from '../../components/MascotBubble';
import { Button } from '@/components/watermelon-ui/button';
import { PILLAR_META, PILLARS } from './constants';

export interface RecoveryLockedViewProps {
  logDate: string;
  onSkipRecovery: () => void;
}

export function RecoveryLockedView({ logDate, onSkipRecovery }: RecoveryLockedViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-ink-faint">Your 3 Daily Wins · {logDate}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Recovery first</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Your wins are ready. They open after one short recovery moment.
        </p>
      </div>

      <MascotBubble
        mood="calm"
        title="Settle first, then do"
        className="max-w-2xl"
        testId="wins-locked"
        actions={
          <>
            <Button asChild>
              <Link to="/cope" data-testid="wins-locked-go-cope">
                <HeartHandshake className="h-4 w-4" aria-hidden="true" />
                Pick a recovery moment
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="wins-skip-recovery"
              onClick={onSkipRecovery}
            >
              Skip recovery today
            </Button>
          </>
        }
      >
        <p>
          A few minutes of breathing, a hobby, or a brain dump calms your nervous system, so the
          wins after it feel lighter. Pick whichever one you like.
        </p>
      </MascotBubble>

      <ul className="grid gap-3 sm:grid-cols-3" aria-label="Waiting for you">
        {PILLARS.map((pillar) => (
          <li
            key={pillar}
            className={`flex items-center gap-3 rounded-3xl border border-dashed border-line-strong bg-surface p-4`}
          >
            <Mascot pillar={pillar} mood="calm" className="h-11 w-10 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink">{PILLAR_META[pillar].label}</span>
              <span className="block text-xs text-ink-soft">{PILLAR_META[pillar].subtitle}</span>
            </span>
            <Lock className="h-4 w-4 shrink-0 text-ink" aria-label="Locked" />
          </li>
        ))}
      </ul>
    </div>
  );
}
