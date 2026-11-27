import type { Pillar } from '../../api/types';

export const PILLARS: Pillar[] = ['physical', 'work', 'soul'];

// Each pillar keeps one signal color (Figma): a dot and a label tint, never a whole card.
export const PILLAR_META: Record<
  Pillar,
  { label: string; subtitle: string; dot: string; text: string }
> = {
  physical: {
    label: 'Physical Win',
    subtitle: 'Be kind to your body',
    dot: 'bg-mint-strong',
    text: 'text-mint-strong',
  },
  work: {
    label: 'Work Win',
    subtitle: 'One tiny step, zero overwhelm',
    dot: 'bg-sun-strong',
    text: 'text-sun-strong',
  },
  soul: {
    label: 'Soul Win',
    subtitle: 'A quiet moment just for you',
    dot: 'bg-sky-strong',
    text: 'text-sky-strong',
  },
};

// Each sliced step gets its own focus timer, so the next step starts fresh.
export const timerKey = (userId: string, date: string, pillar: Pillar, stepsDone = 0) =>
  pillar === 'work'
    ? `${userId}:${date}:win:work-focus:${stepsDone}`
    : `${userId}:${date}:win:${pillar}`;
