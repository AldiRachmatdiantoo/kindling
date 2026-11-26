import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Pillar } from '../api/types';
import { Mascot } from './Mascot';
import './celebration.css';

export type Celebration =
  { id: number; kind: 'win'; pillar: Pillar; count: number } | { id: number; kind: 'all' };

const WIN_COPY: Record<Pillar, { title: string; line: string; accent: string }> = {
  physical: { title: 'Body win done!', line: 'Timber is flexing for you.', accent: '#5be0a0' },
  work: { title: 'Work win done!', line: 'Sparky says: one step at a time.', accent: '#f5c451' },
  soul: { title: 'Heart win done!', line: 'Glow is beaming at you.', accent: '#6cb4ff' },
};

const CONFETTI_COLORS = ['#7c8cff', '#5be0a0', '#f5c451', '#6cb4ff', '#ff8c7a'];

/** Stable pseudo-random numbers, so the confetti looks scattered but renders the same each time. */
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const vars = (v: Record<string, string>) => v as CSSProperties;

function Burst({ accent, rays }: { accent: string; rays: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rays }, (_, i) => (
        <i
          key={`r${i}`}
          className="kc-ray"
          style={vars({
            '--kc-r': `${(360 / rays) * i}deg`,
            '--kc-accent': accent,
            animationDelay: `${200 + i * 14}ms`,
          })}
        />
      ))}
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 8 + 0.35;
        const dist = 115 + seeded(i, 3) * 50;
        return (
          <i
            key={`s${i}`}
            className="kc-spark"
            style={vars({
              '--kc-x': `${Math.cos(angle) * dist}px`,
              '--kc-y': `${Math.sin(angle) * dist}px`,
            })}
          />
        );
      })}
    </div>
  );
}

export interface CelebrationOverlayProps {
  celebration: Celebration | null;
  onDone: () => void;
}

/**
 * The pillar mascot pops up when a Daily Win is marked done, and the whole crew shows up for
 * 3 out of 3. It stays until the user taps, or presses Escape, Enter or Space, and never moves focus.
 */
export function CelebrationOverlay({ celebration, onDone }: CelebrationOverlayProps) {
  const [leaving, setLeaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  // Kept in a ref so a parent re-render (a new onDone function) never re-binds the key listener.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setLeaving(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onDoneRef.current();
    }, reduce ? 0 : 300);
  }, []);

  useEffect(() => {
    if (!celebration) return;
    const opener = document.activeElement as HTMLElement | null;
    closingRef.current = false;
    setLeaving(false);
    dismissRef.current?.focus();
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab' || !overlayRef.current) return;
      const focusables = [
        ...overlayRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first || !overlayRef.current.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || !overlayRef.current.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      document.documentElement.style.overflow = prevOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [celebration, close]);

  if (!celebration) return null;

  const isAll = celebration.kind === 'all';
  const copy = isAll
    ? { title: 'All 3 daily wins!', line: 'Small sparks, steady fire. See you tomorrow.' }
    : WIN_COPY[celebration.pillar];

  return createPortal(
    <div
      key={celebration.id}
      ref={overlayRef}
      className={`kc-overlay${leaving ? ' kc-out' : ''}`}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kc-title"
      data-testid="win-celebration"
      data-kind={celebration.kind}
    >
      <div className="kc-stage">
        <Burst
          accent={isAll ? '#7c8cff' : WIN_COPY[celebration.pillar].accent}
          rays={isAll ? 14 : 10}
        />
        {isAll ? (
          <div className="kc-finale">
            <div className="kc-ember kc-jump" style={{ animationDelay: '550ms' }}>
              <div className="kc-hop" style={{ animationDelay: '1.4s' }}>
                <Mascot mood="cheer" className="" />
              </div>
            </div>
            <div className="kc-crew">
              {(['physical', 'work', 'soul'] as Pillar[]).map((pillar, i) => (
                <div key={pillar} className="kc-jump" style={{ animationDelay: `${i * 160}ms` }}>
                  <div className="kc-hop" style={{ animationDelay: `${900 + i * 200}ms` }}>
                    <Mascot pillar={pillar} mood="cheer" className="" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="kc-hero">
            <div className="kc-float">
              <Mascot pillar={celebration.pillar} mood="cheer" className="" />
            </div>
          </div>
        )}
      </div>

      <div className="kc-count" aria-hidden="true">
        {isAll ? (
          <span className="kc-num kc-num-only">3 / 3</span>
        ) : (
          <>
            <span className="kc-num kc-num-old">{celebration.count - 1} / 3</span>
            <span className="kc-num kc-num-new">{celebration.count} / 3</span>
          </>
        )}
      </div>

      <div className="kc-caption" aria-live="polite">
        <h2 id="kc-title">{copy.title}</h2>
        <p>{copy.line}</p>
      </div>
      <button
        ref={dismissRef}
        type="button"
        className="kc-hint"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        data-testid="win-celebration-close"
      >
        Tap anywhere to keep going
      </button>

      {isAll &&
        Array.from({ length: 44 }, (_, i) => (
          <i
            key={`c${i}`}
            className="kc-confetti"
            aria-hidden="true"
            style={vars({
              left: `${seeded(i, 1) * 100}%`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              '--kc-d': `${2.2 + seeded(i, 2) * 1.6}s`,
              '--kc-dl': `${seeded(i, 4) * 1.1}s`,
              '--kc-dx': `${seeded(i, 5) * 120 - 60}px`,
              '--kc-rot': `${seeded(i, 6) * 720 - 360}deg`,
            })}
          />
        ))}
    </div>,
    document.body,
  );
}
