import type { ReactNode } from 'react';
import type { Pillar } from '../api/types';
import { Mascot, MASCOT_NAME, PILLAR_MASCOT, type MascotMood } from './Mascot';

export interface MascotBubbleProps {
  mood?: MascotMood;
  pillar?: Pillar;
  title?: ReactNode;
  /** Id for the title, so a dialog can point aria-labelledby at it. */
  titleId?: string;
  /** Top-right slot of the bubble, e.g. a step counter or a close button. */
  corner?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  testId?: string;
  /** 'sm' for inline feature tips: smaller character, tighter bubble, h3 title. */
  size?: 'md' | 'sm';
}

/**
 * Ember on the left, a speech bubble on the right with its tail pointing at Ember. Used
 * wherever the app talks to the user in a personal voice (empty states, sympathy after a
 * check-in answer, celebration), so that voice always has the same face.
 */
export function MascotBubble({
  mood = 'happy',
  pillar,
  title,
  titleId,
  corner,
  actions,
  children,
  className = '',
  testId,
  size = 'md',
}: MascotBubbleProps) {
  const small = size === 'sm';
  // The pillar characters narrate their own features; Ember speaks everywhere else.
  const speaker = pillar ? PILLAR_MASCOT[pillar].name : MASCOT_NAME;
  const TitleTag = small ? 'h3' : 'h2';
  return (
    <div className={`flex items-end gap-2 sm:gap-3 ${className}`} data-testid={testId}>
      <Mascot
        mood={mood}
        pillar={pillar}
        className={`k-pop shrink-0 ${small ? 'h-16 w-14' : 'h-24 w-20 sm:h-28 sm:w-24'}`}
      />

      <div
        className={`relative mb-4 min-w-0 flex-1 rounded-3xl border-[1.5px] border-ink bg-surface ${small ? 'p-4' : 'p-5 sm:p-6'}`}
      >
        {/* Tail: a rotated square showing only its left and bottom borders. */}
        <span
          className="absolute bottom-6 -left-[9px] h-4 w-4 rotate-45 border-b-[1.5px] border-l-[1.5px] border-ink bg-surface"
          aria-hidden="true"
        />

        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-white">
            {speaker}
          </span>
          {corner}
        </div>

        {title && (
          <TitleTag
            id={titleId}
            className={`leading-snug font-bold text-ink ${small ? 'text-base' : 'text-lg sm:text-xl'}`}
          >
            {title}
          </TitleTag>
        )}
        {children && <div className="mt-1.5 text-sm leading-relaxed text-ink-soft">{children}</div>}
        {actions && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}
