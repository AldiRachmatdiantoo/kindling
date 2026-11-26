import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Pillar } from '../api/types';
import type { MascotMood } from './Mascot';
import { MascotBubble } from './MascotBubble';

export interface MascotDialogProps {
  /** Called on Escape and on a click outside the bubble. */
  onClose: () => void;
  title: ReactNode;
  titleId: string;
  mood?: MascotMood;
  pillar?: Pillar;
  corner?: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
  /** The button that gets focus when the dialog opens (usually the main action). */
  initialFocusRef: RefObject<HTMLButtonElement | null>;
  /** Re-runs the entrance animation and focus when it changes (e.g. the tour step). */
  stepKey?: string | number;
  testId?: string;
}

/**
 * A modal speech bubble from the mascot. Portaled to <body> because the page's entrance
 * animation leaves a transform on its ancestors, which would otherwise trap
 * position:fixed inside the content area. Escape closes it and Tab stays inside.
 */
export function MascotDialog({
  onClose,
  title,
  titleId,
  mood,
  pillar,
  corner,
  actions,
  children,
  initialFocusRef,
  stepKey,
  testId,
}: MascotDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initialFocusRef.current?.focus();
  }, [initialFocusRef, stepKey]);

  useEffect(() => {
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevOverflow;
    };
  }, []);

  const handleKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = [
      ...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'),
    ];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="k-dim-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid={testId}
    >
      <div
        key={stepKey}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeys}
        className="k-dialog-in w-full max-w-lg"
      >
        <MascotBubble mood={mood} pillar={pillar} title={title} titleId={titleId} corner={corner} actions={actions}>
          {children}
        </MascotBubble>
      </div>
    </div>,
    document.body
  );
}
