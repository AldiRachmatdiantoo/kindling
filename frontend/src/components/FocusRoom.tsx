import { Archive, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { CopeOption } from '../api/types';
import { formatSecondsMMSS } from '../utils/date';
import { BREATHING_PATTERNS, getBreathingPhase, pickBreathingPattern } from './breathingPatterns';
import { useClockTimer } from './useClockTimer';
import { Button } from '@/components/watermelon-ui/button';
import './focus-room.css';

const PHASE_ACCENT: Record<string, string> = {
  'Breathe in': '#8dbbff',
  Hold: '#b8acff',
  'Breathe out': '#7ddba8',
};

function Controls({
  running,
  finished,
  onStart,
  onPause,
  onReset,
  testIdPrefix,
}: {
  running: boolean;
  finished: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  testIdPrefix: string;
}) {
  return (
    <div className="fr-controls">
      <Button onClick={running ? onPause : onStart} data-testid={`${testIdPrefix}-toggle`}>
        {running ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4" aria-hidden="true" />
        )}
        {running ? 'Pause' : finished ? 'Again' : 'Start'}
      </Button>
      <Button variant="secondary" onClick={onReset} data-testid={`${testIdPrefix}-reset`}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Reset
      </Button>
    </div>
  );
}

function BreathingRoom({ option, persistKey }: { option: CopeOption; persistKey: string }) {
  const pattern = pickBreathingPattern(`${option.title} ${option.guidance}`);
  const meta = BREATHING_PATTERNS[pattern];
  const cycle = meta.phases.reduce((sum, ph) => sum + ph.duration, 0);
  const duration = Math.max(cycle, Math.floor(option.duration_seconds));
  // Same key as the inline pacer used, so a session already under way carries on here.
  const timer = useClockTimer(duration, `${persistKey}:${pattern}`);
  const finished = timer.elapsed >= duration;
  const { phase, phaseRemaining } = getBreathingPhase(timer.elapsed, pattern);
  const active = timer.running && !finished;

  // The orb eases toward the phase's size over exactly that phase's length.
  const big = phase.name === 'Breathe in' || (phase.name === 'Hold' && phase.scale.includes('110'));
  const scale = active ? (big ? 0.9 : 0.55) : 0.55;
  const stage = !active ? 'fr-idle' : phase.name === 'Hold' ? 'fr-hold' : '';
  const accent = active ? (PHASE_ACCENT[phase.name] ?? '#8dbbff') : '#8dbbff';

  return (
    <>
      <h2 className="fr-title" id="fr-title">
        {option.title}
      </h2>
      <div
        className={`fr-orb-wrap ${stage}`}
        style={{ '--fr-accent': accent } as CSSProperties}
        data-testid="focus-breathing-orb"
      >
        <div
          className="fr-orb"
          style={
            {
              transform: `scale(${scale})`,
              transitionDuration: active && phase.name !== 'Hold' ? `${phase.duration}s` : '600ms',
              '--fr-scale': scale,
            } as CSSProperties
          }
        >
          <div className="fr-blob" />
          <div className="fr-blob fr-blob-2" />
        </div>
        <div className="fr-ring" />
        <div className="fr-orb-label" aria-live="polite">
          <strong data-testid="focus-breathing-phase">
            {finished ? 'Done' : active ? phase.name : 'Ready'}
          </strong>
          {!finished && <span>{active ? phaseRemaining : meta.label}</span>}
        </div>
      </div>
      <p className="fr-sub">
        {finished
          ? "That's the session. Notice how your shoulders sit a little lower now."
          : active
            ? phase.hint
            : meta.intro}
      </p>
      <div className="fr-time" data-testid="focus-breathing-remaining">
        {formatSecondsMMSS(duration - timer.elapsed)}
      </div>
      <Controls
        running={timer.running}
        finished={finished}
        onStart={timer.start}
        onPause={timer.pause}
        onReset={timer.reset}
        testIdPrefix="focus-breathing"
      />
    </>
  );
}

function HobbyRoom({ option, persistKey }: { option: CopeOption; persistKey: string }) {
  const duration = Math.max(1, Math.floor(option.duration_seconds));
  const timer = useClockTimer(duration, persistKey);
  const finished = timer.elapsed >= duration;
  const minutes = Math.max(1, Math.round(duration / 60));
  const r = 92;
  const circumference = 2 * Math.PI * r;
  const progress = timer.elapsed / duration;

  return (
    <>
      <h2 className="fr-title" id="fr-title">
        {option.title}
      </h2>
      <p className="fr-permission" data-testid="focus-permission">
        {finished
          ? "Time's up. That was yours, and it counted."
          : `This time is yours. No need to be productive for the next ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`}
      </p>
      <div className="fr-vinyl-wrap" aria-hidden="true">
        <svg viewBox="0 0 200 200">
          <circle className="fr-ring-track" cx="100" cy="100" r={r} />
          <circle
            className="fr-ring-fill"
            cx="100"
            cy="100"
            r={r}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
          <g className={`fr-vinyl ${timer.running ? 'fr-spinning' : ''}`}>
            <circle cx="100" cy="100" r="80" fill="#1c1513" />
            {[70, 60, 50, 40].map((gr) => (
              <circle
                key={gr}
                cx="100"
                cy="100"
                r={gr}
                fill="none"
                stroke="#3b2f2a"
                strokeWidth="1.5"
              />
            ))}
            <path d="M100 22 A78 78 0 0 1 166 60" fill="none" stroke="#5a4840" strokeWidth="3" />
            <circle cx="100" cy="100" r="26" fill="#ffc58a" />
            <circle cx="100" cy="100" r="4" fill="#1c1513" />
          </g>
        </svg>
      </div>
      <div className="fr-time" data-testid="focus-hobby-remaining">
        {formatSecondsMMSS(duration - timer.elapsed)}
      </div>
      <p className="fr-sub">{option.guidance}</p>
      <Controls
        running={timer.running}
        finished={finished}
        onStart={timer.start}
        onPause={timer.pause}
        onReset={timer.reset}
        testIdPrefix="focus-hobby"
      />
    </>
  );
}

/** A reinforcing line written from what happened on screen. The text itself never leaves it. */
function archiveLine(words: number): string {
  if (words >= 60) {
    return `That was ${words} words of weight, and none of it has to live in your head now. It's folded up and set aside.`;
  }
  if (words >= 15) {
    return `${words} words, out of your head and folded away. What's left is a little more room for today.`;
  }
  return 'Even a few words count. They are out, folded, and set aside.';
}

function BrainDumpRoom({ option, persistKey }: { option: CopeOption; persistKey: string }) {
  const duration = Math.max(1, Math.floor(option.duration_seconds));
  const timer = useClockTimer(duration, persistKey);
  const finished = timer.elapsed >= duration;
  const [draft, setDraft] = useState('');
  const [stage, setStage] = useState<'writing' | 'folding' | 'archived'>('writing');
  const [words, setWords] = useState(0);
  const foldTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (foldTimerRef.current !== null) {
        window.clearTimeout(foldTimerRef.current);
        foldTimerRef.current = null;
      }
    };
  }, []);

  const fold = () => {
    setWords(draft.trim().split(/\s+/).filter(Boolean).length);
    timer.pause();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setStage('folding');
    if (foldTimerRef.current !== null) window.clearTimeout(foldTimerRef.current);
    foldTimerRef.current = window.setTimeout(
      () => {
        foldTimerRef.current = null;
        setDraft(''); // gone from memory too, not just hidden
        setStage('archived');
      },
      reduce ? 0 : 900,
    );
  };

  if (stage === 'archived') {
    return (
      <>
        <div className="fr-envelope" aria-hidden="true">
          <Archive className="h-9 w-9 text-[#b8acff]" />
        </div>
        <h2 className="fr-title" id="fr-title">
          Folded and filed away
        </h2>
        <p className="fr-archived" data-testid="focus-archived">
          {archiveLine(words)}
        </p>
        <div className="fr-after fr-controls">
          <Button asChild>
            <Link to="/wins" data-testid="focus-go-wins">
              On to my 3 Daily Wins
            </Link>
          </Button>
          <Button variant="secondary" onClick={() => setStage('writing')}>
            Write some more
          </Button>
        </div>
        <p className="fr-note">Nothing you wrote was saved or sent anywhere.</p>
      </>
    );
  }

  return (
    <>
      <h2 className="fr-title" id="fr-title">
        {option.title}
      </h2>
      <p className="fr-sub">{option.guidance}</p>
      <div className="flex items-center gap-3">
        <span className="fr-time text-3xl" data-testid="focus-dump-remaining">
          {formatSecondsMMSS(duration - timer.elapsed)}
        </span>
        {!finished && (
          <Button
            variant="secondary"
            size="sm"
            onClick={timer.running ? timer.pause : timer.start}
            data-testid="focus-dump-toggle"
          >
            {timer.running ? 'Pause timer' : 'Start timer'}
          </Button>
        )}
      </div>
      <div className={`fr-page ${stage === 'folding' ? 'fr-folding' : ''}`}>
        <label htmlFor="fr-dump" className="sr-only">
          Everything on your mind
        </label>
        <textarea
          id="fr-dump"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (!timer.running && timer.elapsed === 0) timer.start();
          }}
          placeholder="Write down everything on your mind right now. It doesn't have to be neat..."
          data-testid="focus-dump-input"
          disabled={stage === 'folding'}
        />
      </div>
      <p className="fr-note">
        {finished
          ? 'Time is up. Fold it away whenever you are ready.'
          : 'This only lives on your screen. Nothing is saved or sent.'}
      </p>
      <Button
        onClick={fold}
        disabled={!draft.trim() || stage === 'folding'}
        data-testid="focus-fold"
      >
        <Archive className="h-4 w-4" aria-hidden="true" />
        Fold it away
      </Button>
    </>
  );
}

export interface FocusRoomProps {
  option: CopeOption;
  /** Shared with the timers so time keeps counting while the room is closed. */
  persistKey: string;
  onClose: () => void;
}

/**
 * Full-screen space for the picked recovery moment: a breathing orb, a hobby timer that
 * says the time is theirs, or a brain-dump page that folds itself away. Escape or the
 * close button leaves; timers keep running in the background either way.
 */
export function FocusRoom({ option, persistKey, onClose }: FocusRoomProps) {
  const [leaving, setLeaving] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setLeaving(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onCloseRef.current();
    }, reduce ? 0 : 260);
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab' || !roomRef.current) return;
      const focusables = [
        ...roomRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
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
        (document.activeElement === first || !roomRef.current.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || !roomRef.current.contains(document.activeElement))
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
      root.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [close]);

  const kicker =
    option.tool_type === 'breathing'
      ? 'Breathing room'
      : option.tool_type === 'brain_dump'
        ? 'Brain-dump room'
        : 'Your time';

  return createPortal(
    <div
      ref={roomRef}
      className={`fr-room${leaving ? ' fr-out' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fr-title"
      data-tool={option.tool_type}
      data-testid="focus-room"
    >
      <div className="fr-top">
        <span className="fr-kicker">{kicker}</span>
        <button
          ref={closeRef}
          type="button"
          className="fr-close"
          onClick={close}
          data-testid="focus-room-close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Close
        </button>
      </div>
      <div className="fr-body">
        {option.tool_type === 'breathing' && (
          <BreathingRoom option={option} persistKey={persistKey} />
        )}
        {option.tool_type === 'timer' && <HobbyRoom option={option} persistKey={persistKey} />}
        {option.tool_type === 'brain_dump' && (
          <BrainDumpRoom option={option} persistKey={persistKey} />
        )}
      </div>
    </div>,
    document.body,
  );
}
