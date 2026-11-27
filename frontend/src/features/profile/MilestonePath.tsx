import { MapPin, Package, PackageOpen } from 'lucide-react';
import { useId, useState } from 'react';
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
const VISIBLE_CHECKPOINTS = 3;

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

  const openReachedOn = openNumber === null ? undefined : reachedOn.get(openNumber);
  const summary = pillarSummary(pillar, progress);

  return (
    <div
      role="group"
      aria-label={summary}
      className="rounded-3xl border border-line bg-surface-2 p-4 sm:p-5"
      data-testid={`milestone-${pillar}`}
    >
      <div className="flex items-center gap-3">
        <Mascot
          pillar={pillar}
          mood={total > 0 ? 'happy' : 'calm'}
          className="h-14 w-12 shrink-0"
        />
        <div className="min-w-0">
          <h3 className={`text-lg font-bold ${meta.text}`}>{PILLAR_NAME[pillar]}</h3>
          <p className="text-xs text-ink-soft" data-testid={`milestone-${pillar}-summary`}>
            {plural(total, 'win')} · {plural(progress.checkpoints.length, 'checkpoint')}
          </p>
        </div>
      </div>

      {hiddenCheckpoints > 0 && (
        <button
          type="button"
          className="k-press mt-3 text-xs font-semibold text-primary underline underline-offset-2"
          onClick={() => setShowEarlier(true)}
          data-testid={`milestone-${pillar}-earlier`}
        >
          Show {plural(hiddenCheckpoints, 'earlier checkpoint')}
        </button>
      )}

      <ol
        className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-3"
        aria-label={`${PILLAR_NAME[pillar]} path`}
      >
        {nodes.map((n) => {
          const done = n <= total;
          const isCheckpoint = n % WINS_PER_CHECKPOINT === 0;
          const isLast = done && n === total;

          if (isCheckpoint && done) {
            const number = n / WINS_PER_CHECKPOINT;
            const date = reachedOn.get(number);
            const open = openNumber === number;
            const Icon = open ? PackageOpen : Package;
            return (
              <li key={n} className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={`k-press flex h-11 w-11 items-center justify-center rounded-2xl border ${
                    open ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface'
                  } ${isLast ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-2' : ''}`}
                  aria-expanded={open}
                  aria-controls={noteId}
                  aria-label={`Checkpoint ${number}${date ? `, reached ${formatPathDate(date)}` : ''}. ${
                    open ? 'Close' : 'Open'
                  } appreciation note`}
                  onClick={() => setOpenNumber(open ? null : number)}
                  data-testid={`milestone-${pillar}-checkpoint-${number}`}
                >
                  <Icon className={`h-5 w-5 ${meta.text}`} aria-hidden="true" />
                </button>
              </li>
            );
          }

          if (isCheckpoint) {
            return (
              <li
                key={n}
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-line-strong"
              >
                <Package className="h-5 w-5 text-ink-faint" />
              </li>
            );
          }

          return (
            <li key={n} aria-hidden="true" className="flex items-center">
              <span
                className={`block h-3.5 w-3.5 rounded-full ${
                  done ? meta.dot : 'border border-dashed border-line-strong'
                } ${isLast ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-2' : ''}`}
              />
            </li>
          );
        })}
      </ol>

      <div id={noteId} aria-live="polite">
        {openNumber !== null && (
          <div
            className="k-enter mt-3 rounded-2xl border border-primary bg-surface p-4"
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

      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
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
 * One path per pillar: a dot for every finished win, and every third win opens a chest with
 * a note of appreciation. Past days are locked, so the path only moves forward or stays.
 */
export function MilestonePath({ progress, today }: MilestonePathProps) {
  const empty = PILLARS.every((p) => progress[p].completed_total === 0);

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
          <ul className="grid gap-3 lg:grid-cols-3">
            {PILLARS.map((pillar) => (
              <li key={pillar}>
                <PillarPath pillar={pillar} progress={progress[pillar]} today={today} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
