import { Check, Package, PackageOpen } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Pillar, PillarProgressSet } from '../api/types';
import { curveThrough, stepOffset } from '../features/profile/MilestonePath';
import { Mascot } from './Mascot';

const WINS_PER_CHECKPOINT = 3;
/** Steps already behind the new one, so the new step lands on a path the user recognises. */
const STEPS_BEHIND = 2;
const PILLARS: Pillar[] = ['physical', 'work', 'soul'];
const NAME: Record<Pillar, string> = {
  physical: 'Physical',
  work: 'Work',
  soul: 'Soul',
};
/** The overlay is always dark, so the pillar colors here are the light, bright ones. */
export const PATH_ACCENT: Record<Pillar, string> = {
  physical: '#5be0a0',
  work: '#f5c451',
  soul: '#6cb4ff',
};
/** Each pillar's new step fills this long after the one before it. */
export const PATH_STAGGER_MS = 420;

const isChest = (step: number) => step % WINS_PER_CHECKPOINT === 0;

/** Each column is a small copy of the profile's Milestone Path: same left-right sway per step. */
const COL_PX = 100;
const ROW_PX = 54;
const MAX_ROWS = STEPS_BEHIND + 2;
const SWAY_SCALE = 0.35;

/** Horizontal offset of step n inside a column, following the profile path's wave. */
export function columnSway(n: number): number {
  return Math.round(stepOffset(n) * SWAY_SCALE);
}

/** Steps drawn in one pillar's column, top to bottom: a few behind, the new one, the next one. */
export function pathSteps(total: number): number[] {
  const first = Math.max(1, total - STEPS_BEHIND);
  const steps: number[] = [];
  for (let n = first; n <= total + 1; n += 1) steps.push(n);
  return steps;
}

/** Which pillars reached a checkpoint with today's win. */
export function chestsReached(progress: PillarProgressSet): Pillar[] {
  return PILLARS.filter(
    (p) => progress[p].completed_total > 0 && isChest(progress[p].completed_total),
  );
}

const vars = (v: Record<string, string>) => v as CSSProperties;

function Column({ pillar, total, index }: { pillar: Pillar; total: number; index: number }) {
  const delay = index * PATH_STAGGER_MS;
  const steps = pathSteps(total);
  const centers = steps.map((n, i): [number, number] => [
    COL_PX / 2 + columnSway(n),
    i * ROW_PX + ROW_PX / 2,
  ]);
  const at = (n: number) => centers[steps.indexOf(n)];
  const behind = steps.filter((n) => n < total);
  const height = Math.max(MAX_ROWS, steps.length) * ROW_PX;
  return (
    <div
      className="kc-path-col"
      style={vars({
        '--kc-accent': PATH_ACCENT[pillar],
        '--kc-dl': `${delay}ms`,
      })}
      data-testid={`celebration-path-${pillar}`}
    >
      <div className="kc-path-mascot">
        <Mascot pillar={pillar} mood="cheer" className="" />
      </div>
      <div className="kc-path-track" style={{ height }}>
        <svg
          className="kc-path-curve"
          viewBox={`0 0 ${COL_PX} ${height}`}
          width={COL_PX}
          height={height}
        >
          {behind.length > 1 && <path className="kc-curve-done" d={curveThrough(behind.map(at))} />}
          {behind.length > 0 && (
            <path
              className="kc-curve-new"
              pathLength={1}
              d={curveThrough([at(total - 1), at(total)])}
            />
          )}
          <path className="kc-curve-next" d={curveThrough([at(total), at(total + 1)])} />
        </svg>
        <ol className="kc-path-steps">
          {steps.map((n, i) => {
            const state = n < total ? 'done' : n === total ? 'new' : 'next';
            const chest = isChest(n);
            return (
              <li
                key={n}
                className={`kc-step kc-step-${state}${chest ? ' kc-step-chest' : ''}`}
                style={{ left: centers[i][0], top: centers[i][1] }}
              >
                <span className="kc-node">
                  {chest ? (
                    state === 'next' ? (
                      <Package size={18} strokeWidth={2.25} />
                    ) : (
                      <PackageOpen size={20} strokeWidth={2.25} />
                    )
                  ) : state === 'next' ? null : (
                    <Check size={18} strokeWidth={3} />
                  )}
                </span>
                {state === 'new' && chest && <i className="kc-chest-glow" />}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="kc-path-label">
        <span className="kc-path-name">{NAME[pillar]}</span>
        <span>
          <span className="kc-path-total">
            <span className="kc-path-old">{total - 1}</span>
            <span className="kc-path-new">{total}</span>
          </span>
          {total === 1 ? ' win' : ' wins'}
        </span>
      </p>
    </div>
  );
}

/** The second beat of the 3 out of 3 finale: each pillar's Milestone Path gains today's step. */
export function CelebrationPath({ progress }: { progress: PillarProgressSet }) {
  return (
    <div className="kc-path" data-testid="celebration-path" aria-hidden="true">
      {PILLARS.map((pillar, i) => (
        <Column key={pillar} pillar={pillar} total={progress[pillar].completed_total} index={i} />
      ))}
    </div>
  );
}
