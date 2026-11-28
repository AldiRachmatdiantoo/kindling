import { Check, MapPin, Package, PackageOpen } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Pillar, PillarProgress, PillarProgressSet } from '../../api/types';
import { Mascot } from '../../components/Mascot';
import { PILLAR_META, PILLARS } from '../wins/constants';
import { appreciationNote } from './appreciation';
import { Card } from '@/components/ui/card';

const PILLAR_NAME: Record<Pillar, string> = {
  physical: 'Physical',
  work: 'Work',
  soul: 'Soul',
};

const WINS_PER_CHECKPOINT = 3;
/** Long paths show their latest checkpoints; the earlier ones stay one tap away. */
const VISIBLE_CHECKPOINTS = 2;

/** Each step on the path takes one row; the path winds left and right as it goes down. */
const ROW_PX = 72;
const SWAY_PX = 34;
const WAVE = [0, 1, 2, 1, 0, -1, -2, -1];
/** The mascot stands beside the step where the user last got to, on the open side. */
const MASCOT_GAP_PX = 84;

/** Horizontal offset of step n (1-based) from the path's center line. Stable per step. */
export function stepOffset(n: number): number {
  return WAVE[(n - 1) % WAVE.length] * SWAY_PX;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function formatPathDate(date: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  } catch {
    return date;
  }
}

function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Where the user last stepped on this pillar's path, in plain words. */
export function positionLabel(lastCompletedOn: string, today: string): string {
  if (lastCompletedOn === today) return 'Today you got here';
  if (lastCompletedOn === previousDay(today)) return 'Yesterday you got here';
  return `Last time you got here · ${formatPathDate(lastCompletedOn)}`;
}

export function pillarSummary(pillar: Pillar, progress: PillarProgress): string {
  return `${PILLAR_NAME[pillar]}: ${plural(progress.completed_total, 'win')}, ${plural(
    progress.checkpoints.length,
    'checkpoint',
  )}`;
}

/** Opens on the pillar the user moved on most recently; Physical when there is no win yet. */
export function defaultPillar(progress: PillarProgressSet): Pillar {
  let best: Pillar = 'physical';
  let bestDate = '';
  for (const pillar of PILLARS) {
    const date = progress[pillar].last_completed_on ?? '';
    if (date > bestDate) {
      best = pillar;
      bestDate = date;
    }
  }
  return best;
}

/** A smooth S-curve through the step centers, relative to the path's center line. */
function curveThrough(points: Array<[number, number]>): string {
  if (points.length === 0) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mid = (y1 - y0) / 2;
    d += ` C ${x0} ${y0 + mid} ${x1} ${y1 - mid} ${x1} ${y1}`;
  }
  return d;
}

interface PillarPathProps {
  pillar: Pillar;
  progress: PillarProgress;
  today: string;
}

function PillarPath({ pillar, progress, today }: PillarPathProps) {
  const meta = PILLAR_META[pillar];
  const noteId = useId();
  const [openNumber, setOpenNumber] = useState<number | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);

  const total = progress.completed_total;
  const reachedOn = new Map(progress.checkpoints.map((c) => [c.number, c.reached_on]));
  const hiddenCheckpoints = showEarlier
    ? 0
    : Math.max(0, progress.checkpoints.length - VISIBLE_CHECKPOINTS);
  const firstNode = hiddenCheckpoints * WINS_PER_CHECKPOINT + 1;
  const lastNode = Math.max(total, progress.next_checkpoint_at);

  const nodes: number[] = [];
  for (let n = firstNode; n <= lastNode; n += 1) nodes.push(n);

  const centers = nodes.map((n, i): [number, number] => [stepOffset(n), i * ROW_PX + ROW_PX / 2]);
  const doneCount = Math.max(0, total - firstNode + 1);
  const donePath = curveThrough(centers.slice(0, doneCount));
  const aheadPath = curveThrough(centers.slice(Math.max(0, doneCount - 1)));

  // The mascot stands at the last finished step, or at the first step when there is none.
  const hereIndex = total > 0 ? doneCount - 1 : 0;
  const hereX = centers[hereIndex]?.[0] ?? 0;
  const mascotX = hereX > 0 ? hereX - MASCOT_GAP_PX : hereX + MASCOT_GAP_PX;

  const openReachedOn = openNumber === null ? undefined : reachedOn.get(openNumber);
  const summary = pillarSummary(pillar, progress);

  return (
    <div role="group" aria-label={summary} data-testid={`milestone-${pillar}`}>
      <p className="text-sm text-ink-soft" data-testid={`milestone-${pillar}-summary`}>
        {plural(total, 'win')} · {plural(progress.checkpoints.length, 'checkpoint')}
      </p>

      {hiddenCheckpoints > 0 && (
        <button
          type="button"
          className="k-press mt-2 text-xs font-semibold text-primary underline underline-offset-2"
          onClick={() => setShowEarlier(true)}
          data-testid={`milestone-${pillar}-earlier`}
        >
          Show {plural(hiddenCheckpoints, 'earlier checkpoint')}
        </button>
      )}

      <div className="relative mx-auto mt-2 max-w-xs">
        <svg
          className="pointer-events-none absolute top-0 left-1/2 overflow-visible"
          width="1"
          height={nodes.length * ROW_PX}
          aria-hidden="true"
          focusable="false"
        >
          <path
            d={aheadPath}
            fill="none"
            stroke="var(--color-line-strong)"
            strokeWidth="4"
            strokeDasharray="2 10"
            strokeLinecap="round"
          />
          <path
            d={donePath}
            fill="none"
            className={meta.text}
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            opacity="0.35"
          />
        </svg>

        <span
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          style={{ top: hereIndex * ROW_PX + ROW_PX / 2, left: `calc(50% + ${mascotX}px)` }}
          data-testid={`milestone-${pillar}-mascot`}
        >
          <Mascot pillar={pillar} mood={total > 0 ? 'happy' : 'calm'} className="h-16 w-14" />
        </span>

        <ol className="relative" aria-label={`${PILLAR_NAME[pillar]} path`}>
          {nodes.map((n, i) => {
            const done = n <= total;
            const isCheckpoint = n % WINS_PER_CHECKPOINT === 0;
            const isLast = done && n === total;
            const ring = isLast ? 'ring-4 ring-primary ring-offset-4 ring-offset-surface' : '';
            const shift = { transform: `translateX(${centers[i][0]}px)` };

            if (isCheckpoint && done) {
              const number = n / WINS_PER_CHECKPOINT;
              const date = reachedOn.get(number);
              const open = openNumber === number;
              const Icon = open ? PackageOpen : Package;
              return (
                <li key={n} className="flex items-center justify-center" style={{ height: ROW_PX }}>
                  <button
                    type="button"
                    style={shift}
                    className={`k-press flex h-16 w-16 items-center justify-center rounded-3xl border-2 ${
                      open ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface-2'
                    } ${ring}`}
                    aria-expanded={open}
                    aria-controls={noteId}
                    aria-label={`Checkpoint ${number}${date ? `, reached ${formatPathDate(date)}` : ''}. ${
                      open ? 'Close' : 'Open'
                    } appreciation note`}
                    onClick={() => setOpenNumber(open ? null : number)}
                    data-testid={`milestone-${pillar}-checkpoint-${number}`}
                  >
                    <Icon className={`h-7 w-7 ${meta.text}`} aria-hidden="true" />
                  </button>
                </li>
              );
            }

            if (isCheckpoint) {
              return (
                <li
                  key={n}
                  aria-hidden="true"
                  className="flex items-center justify-center"
                  style={{ height: ROW_PX }}
                >
                  <span
                    style={shift}
                    className="flex h-14 w-14 items-center justify-center rounded-3xl border-2 border-dashed border-line-strong bg-surface"
                  >
                    <Package className="h-6 w-6 text-ink-faint" />
                  </span>
                </li>
              );
            }

            return (
              <li
                key={n}
                aria-hidden="true"
                className="flex items-center justify-center"
                style={{ height: ROW_PX }}
              >
                {done ? (
                  <span
                    style={shift}
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${meta.dot} ${ring}`}
                  >
                    <Check className="h-6 w-6 text-surface" strokeWidth={3} />
                  </span>
                ) : (
                  <span
                    style={shift}
                    className="block h-10 w-10 rounded-full border-2 border-dashed border-line-strong bg-surface"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div id={noteId} aria-live="polite">
        {openNumber !== null && (
          <div
            className="k-enter mt-3 rounded-2xl border border-primary bg-surface-2 p-4"
            data-testid={`milestone-${pillar}-note`}
          >
            <p className="text-xs font-semibold text-ink-faint">
              Checkpoint {openNumber}
              {openReachedOn ? ` · ${formatPathDate(openReachedOn)}` : ''}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink">
              {appreciationNote(pillar, openNumber)}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-soft">
        {progress.last_completed_on ? (
          <>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span data-testid={`milestone-${pillar}-marker`}>
              {positionLabel(progress.last_completed_on, today)}
            </span>
          </>
        ) : (
          <span data-testid={`milestone-${pillar}-marker`}>
            Your first {PILLAR_NAME[pillar].toLowerCase()} win will be the first step here.
          </span>
        )}
      </p>
    </div>
  );
}

export interface MilestonePathProps {
  progress: PillarProgressSet;
  /** The user's local date (YYYY-MM-DD), used to say "Yesterday you got here". */
  today: string;
}

/**
 * One winding path per pillar, picked with tabs: a step for every finished win, and every third
 * step is a chest with a note of appreciation. The pillar's mascot stands where the user last
 * got to. Past days are locked, so the path only moves forward or stays.
 */
export function MilestonePath({ progress, today }: MilestonePathProps) {
  const empty = PILLARS.every((p) => progress[p].completed_total === 0);
  const baseId = useId();
  const [selected, setSelected] = useState<Pillar>(() => defaultPillar(progress));
  const tabRefs = useRef<Partial<Record<Pillar, HTMLButtonElement | null>>>({});

  const tabId = (p: Pillar) => `${baseId}-tab-${p}`;
  const panelId = `${baseId}-panel`;

  // Arrow keys, Home and End move between pillars (WAI-ARIA tabs, automatic activation).
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = PILLARS.indexOf(selected);
    const next =
      event.key === 'ArrowRight'
        ? PILLARS[(index + 1) % PILLARS.length]
        : event.key === 'ArrowLeft'
          ? PILLARS[(index + PILLARS.length - 1) % PILLARS.length]
          : event.key === 'Home'
            ? PILLARS[0]
            : event.key === 'End'
              ? PILLARS[PILLARS.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <Card asChild className="space-y-4 p-6">
      <section aria-labelledby="milestone-path-title" data-testid="milestone-path">
        <div>
          <h2 id="milestone-path-title" className="text-2xl font-bold text-ink">
            Your milestone path
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            Every finished win adds a step. Every third step opens a note for you. Nothing here ever
            goes backwards.
          </p>
        </div>

        {empty ? (
          <div
            className="flex items-center gap-3 rounded-3xl border border-line bg-surface-2 p-4"
            data-testid="milestone-empty"
          >
            <Mascot mood="calm" className="h-14 w-12 shrink-0" />
            <p className="text-sm leading-relaxed text-ink">
              Your path starts with your first win. Pick one small thing on your 3 Daily Wins when
              you feel ready; it will show up here and stay.
            </p>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Choose a pillar"
              className="grid grid-cols-3 gap-2"
              onKeyDown={onTabKeyDown}
            >
              {PILLARS.map((pillar) => {
                const active = pillar === selected;
                return (
                  <button
                    key={pillar}
                    ref={(el) => {
                      tabRefs.current[pillar] = el;
                    }}
                    type="button"
                    role="tab"
                    id={tabId(pillar)}
                    aria-selected={active}
                    aria-controls={panelId}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setSelected(pillar)}
                    className={`k-press flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-1.5 text-sm font-bold ${
                      active
                        ? `border-current bg-surface-2 ${PILLAR_META[pillar].text}`
                        : 'border-line text-ink-soft'
                    }`}
                    data-testid={`milestone-tab-${pillar}`}
                  >
                    <Mascot
                      pillar={pillar}
                      mood={progress[pillar].completed_total > 0 ? 'happy' : 'calm'}
                      className="hidden h-8 w-7 shrink-0 sm:block"
                    />
                    {PILLAR_NAME[pillar]}
                  </button>
                );
              })}
            </div>

            <div role="tabpanel" id={panelId} aria-labelledby={tabId(selected)}>
              <PillarPath
                key={selected}
                pillar={selected}
                progress={progress[selected]}
                today={today}
              />
            </div>
          </>
        )}
      </section>
    </Card>
  );
}
