import type { Pillar } from '../../api/types';

export const PILLARS: Pillar[] = ['physical', 'work', 'soul'];

export const PILLAR_META: Record<Pillar, { label: string; subtitle: string; bg: string }> = {
  physical: {
    label: 'Physical Win',
    subtitle: 'Be kind to your body',
    bg: 'bg-mint',
  },
  work: {
    label: 'Work Win',
    subtitle: 'One tiny step, zero overwhelm',
    bg: 'bg-lavender',
  },
  soul: {
    label: 'Soul Win',
    subtitle: 'A quiet moment just for you',
    bg: 'bg-sky',
  },
};

// Each sliced step gets its own focus timer, so the next step starts fresh.
export const timerKey = (userId: string, date: string, pillar: Pillar, stepsDone = 0) =>
  pillar === 'work'
    ? `${userId}:${date}:win:work-focus:${stepsDone}`
    : `${userId}:${date}:win:${pillar}`;
