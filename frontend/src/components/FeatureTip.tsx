import { Lightbulb } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Pillar } from '../api/types';
import { useAuth } from '../features/auth/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/watermelon-ui/button';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '@/components/watermelon-ui/popover';
import type { MascotMood } from './Mascot';
import { MascotBubble } from './MascotBubble';

const storageKey = (userId: string, id: string) => `kindling:tip:${userId}:${id}`;

function hasSeen(userId: string | undefined, id: string): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(storageKey(userId, id)) === '1';
  } catch {
    return false;
  }
}

function markSeen(userId: string | undefined, id: string) {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId, id), '1');
  } catch {
    // Storage blocked: the trigger simply stays highlighted.
  }
}

export interface FeatureTipProps {
  /** Stable id: remembers per user that this tip was read. */
  id: string;
  title: string;
  children: ReactNode;
  /** The pillar character narrates its own feature; otherwise Ember does. */
  pillar?: Pillar;
  mood?: MascotMood;
  /** Opens by itself the first time, for tips that react to something the user just did. */
  autoOpen?: boolean;
  className?: string;
}

/**
 * A small "How does this work?" button next to a feature. Tapping it opens the mascot's
 * explanation in a Watermelon UI popover that floats above the page, so nothing around it
 * moves. Until the tip has been read once, the button is filled lime so new users spot it.
 */
export function FeatureTip({
  id,
  title,
  children,
  pillar,
  mood = 'happy',
  autoOpen = false,
  className = '',
}: FeatureTipProps) {
  const { user } = useAuth();
  const [seen, setSeen] = useState(() => hasSeen(user?.id, id));
  const [open, setOpen] = useState(() => autoOpen && !hasSeen(user?.id, id));

  useEffect(() => {
    // An auto-opened tip counts as read, so it does not pop up again next time.
    if (open && !seen) {
      markSeen(user?.id, id);
      setSeen(true);
    }
  }, [open, seen, user?.id, id]);

  const handleOpenChange = (next: boolean) => setOpen(next);

  return (
    <div className={className} data-testid={`tip-${id}`}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant={seen ? 'ghost' : 'secondary'}
            size="sm"
            className={cn('gap-1.5 px-3', !seen && 'bg-lime hover:bg-lime-dark')}
            data-testid={`tip-${id}-open`}
          >
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
            How does this work?
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={{ top: 84, right: 12, bottom: 92, left: 12 }}
          aria-label={title}
          className="w-[min(24rem,calc(100vw-1.5rem))] rounded-none border-0 bg-transparent p-0 shadow-none"
          data-testid={`tip-${id}-popover`}
        >
          <MascotBubble
            size="sm"
            mood={mood}
            pillar={pillar}
            title={title}
            className="drop-shadow-[0_8px_24px_rgba(11,10,24,0.18)]"
            actions={
              <PopoverClose asChild>
                <Button variant="secondary" size="sm" data-testid={`tip-${id}-dismiss`}>
                  Got it
                </Button>
              </PopoverClose>
            }
          >
            {children}
          </MascotBubble>
        </PopoverContent>
      </Popover>
    </div>
  );
}
