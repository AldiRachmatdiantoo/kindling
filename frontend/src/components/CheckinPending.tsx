import { ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MascotBubble } from './MascotBubble';
import { Button } from '@/components/watermelon-ui/button';

export interface CheckinPendingProps {
  /** Page heading, so the dashboard keeps its identity while it waits. */
  title: string;
  /** What this page will show once the check-in exists. */
  unlocks: string;
  testId: string;
}

/**
 * Empty state for pages that are built from today's check-in. Says why the page is
 * empty and gives the one action that fills it, without forcing the wizard on someone
 * who chose "Answer later".
 */
export function CheckinPending({ title, unlocks, testId }: CheckinPendingProps) {
  return (
    <div className="space-y-6" data-testid={testId}>
      <div>
        <p className="text-xs font-semibold text-ink-faint">No check-in yet today</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{title}</h1>
      </div>

      <MascotBubble
        mood="calm"
        title="No rush. Answer whenever you're ready."
        className="max-w-2xl"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/profile">See my recovery trail</Link>
            </Button>
            <Button asChild>
              <Link to="/checkin" data-testid={`${testId}-start`}>
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Check in now
              </Link>
            </Button>
          </>
        }
      >
        <p>{unlocks} It's just 9 quick questions, about 2 minutes.</p>
      </MascotBubble>
    </div>
  );
}
