import { Feather, Info, Scissors } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Pillar } from '../api/types';
import './task-morph.css';

export interface TaskMorph {
  id: number;
  /** shrink: "Still too heavy". slice: the AI Task Slicer, first step or the next one. */
  kind: 'shrink' | 'slice';
  pillar: Pillar;
  from: string;
  /** null while the request is in flight; the result once it lands. */
  to: string | null;
  /** Shown above the result, e.g. "Step 2". */
  label?: string;
  /** Why a simpler template answered instead of the AI, shown with the result. */
  note?: string;
}

const CARD_BG: Record<Pillar, string> = {
  physical: '#12261c',
  work: '#2a2212',
  soul: '#13233a',
};

const COPY = {
  shrink: {
    working: 'Making it lighter...',
    done: 'Lighter now. No penalty, any step counts.',
    button: "Okay, I'll try this",
  },
  slice: {
    working: 'Slicing it into one small step...',
    done: 'Just this one piece. The rest can wait.',
    button: "Let's do this step",
  },
};

export interface TaskMorphOverlayProps {
  morph: TaskMorph | null;
  onClose: () => void;
}

/**
 * A centered moment for "Still too heavy" and the Task Slicer: the goal visibly shrinks or gets
 * cut, then the result is shown. It waits for the request and closes only when the user says so.
 */
export function TaskMorphOverlay({ morph, onClose }: TaskMorphOverlayProps) {
  const [leaving, setLeaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const done = Boolean(morph?.to);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setLeaving(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    closeTimerRef.current = window.setTimeout(
      () => {
        closeTimerRef.current = null;
        setLeaving(false);
        onCloseRef.current();
        const back = returnFocusRef.current;
        if (back?.isConnected) back.focus();
      },
      reduce ? 0 : 220,
    );
  }, []);

  const morphId = morph?.id;
  useEffect(() => {
    if (morphId === undefined) return;
    closingRef.current = false;
    setLeaving(false);
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], textarea:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (focusables.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first || !dialogRef.current.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || !dialogRef.current.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onTab);
    return () => {
      window.removeEventListener('keydown', onTab);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [morphId]);

  useEffect(() => {
    if (!done) return;
    buttonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, close]);

  if (!morph) return null;
  const copy = COPY[morph.kind];
  const bg = CARD_BG[morph.pillar];

  return createPortal(
    <div
      key={morph.id}
      ref={dialogRef}
      tabIndex={-1}
      className={`tm-overlay${leaving ? ' tm-out' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tm-status"
      aria-busy={!done}
      data-testid="task-morph"
      data-kind={morph.kind}
      data-phase={done ? 'done' : 'working'}
    >
      <div className={`tm-stage tm-${morph.kind}`} aria-hidden="true">
        {morph.kind === 'shrink' ? (
          <>
            <div
              className={`tm-card tm-from ${done ? 'tm-shrunk' : 'tm-squeeze'}`}
              style={{ background: bg }}
            >
              {morph.from}
            </div>
            {!done &&
              [0, 1, 2].map((i) => (
                <Feather
                  key={i}
                  className="tm-feather"
                  style={{ animationDelay: `${i * 380}ms`, left: `${28 + i * 22}%` }}
                />
              ))}
          </>
        ) : (
          <>
            <div
              className={`tm-card tm-from tm-half tm-left${done ? ' tm-apart' : ''}`}
              style={{ background: bg }}
            >
              {morph.from}
            </div>
            <div
              className={`tm-card tm-from tm-half tm-right${done ? ' tm-apart' : ''}`}
              style={{ background: bg }}
            >
              {morph.from}
            </div>
            {!done && (
              <div className="tm-blade">
                <Scissors className="tm-scissors" />
              </div>
            )}
          </>
        )}

        {done && (
          <div
            className="tm-card tm-result"
            style={{ background: bg }}
            data-testid="task-morph-result"
          >
            {morph.label && <span className="tm-label">{morph.label}</span>}
            {morph.to}
          </div>
        )}
      </div>

      {done && morph.note && (
        <p className="tm-note" data-testid="task-morph-note">
          <Info className="tm-note-icon" aria-hidden="true" />
          {morph.note}
        </p>
      )}

      {/* The visual is decorative; this line carries the meaning for screen readers too. */}
      <p id="tm-status" className="tm-status" aria-live="polite">
        {done ? (
          <>
            <span className="tm-sr">
              {morph.label ? `${morph.label}: ` : ''}
              {morph.to}.{' '}
            </span>
            {copy.done}
          </>
        ) : (
          copy.working
        )}
      </p>

      {done && (
        <button
          ref={buttonRef}
          type="button"
          className="tm-btn"
          onClick={close}
          data-testid="task-morph-close"
        >
          {copy.button}
        </button>
      )}
    </div>,
    document.body,
  );
}
