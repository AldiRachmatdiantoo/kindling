import type { Pillar } from '../api/types';

export type MascotMood = 'happy' | 'calm' | 'cheer' | 'sleepy';

export const MASCOT_NAME = 'Ember';

/** One campfire family: Ember guides, and each pillar has its own character. */
export const PILLAR_MASCOT: Record<Pillar, { name: string }> = {
  physical: { name: 'Timber' },
  work: { name: 'Sparky' },
  soul: { name: 'Glow' },
};

export interface MascotProps {
  mood?: MascotMood;
  /** Picks the pillar's character (Timber, Sparky, Glow). Without it, Ember is drawn. */
  pillar?: Pillar;
  className?: string;
}

const INK = '#1f1b3a';
const BLUSH = '#ffb59e';
/** Limbs sit on the page, not on the body fill, so they follow the theme's ink. */
const LIMB = 'var(--color-ink)';

interface FaceProps {
  mood: MascotMood;
  lx: number;
  rx: number;
  y: number;
  /** Glow always smiles wide: positivity is its personality, not a mood. */
  alwaysOpen?: boolean;
}

function Face({ mood, lx, rx, y, alwaysOpen }: FaceProps) {
  const cx = (lx + rx) / 2;
  const eyes =
    mood === 'happy' || mood === 'cheer' || alwaysOpen ? (
      <g fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
        <path d={`M${lx - 5} ${y + 2} Q${lx} ${y - 4} ${lx + 5} ${y + 2}`} />
        <path d={`M${rx - 5} ${y + 2} Q${rx} ${y - 4} ${rx + 5} ${y + 2}`} />
      </g>
    ) : mood === 'sleepy' ? (
      <g fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
        <path d={`M${lx - 5} ${y} Q${lx} ${y + 4} ${lx + 5} ${y}`} />
        <path d={`M${rx - 5} ${y} Q${rx} ${y + 4} ${rx + 5} ${y}`} />
      </g>
    ) : (
      <g fill={INK}>
        <ellipse cx={lx} cy={y} rx="3.4" ry="4" />
        <ellipse cx={rx} cy={y} rx="3.4" ry="4" />
      </g>
    );

  const my = y + 10;
  let mouth;
  if (mood === 'cheer' || alwaysOpen) {
    mouth = (
      <path
        d={`M${cx - 8} ${my - 1} Q${cx} ${my + 12} ${cx + 8} ${my - 1} Z`}
        fill={INK}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    );
  } else if (mood === 'sleepy') {
    mouth = <path d={`M${cx - 4} ${my + 2} Q${cx} ${my + 4} ${cx + 4} ${my + 2}`} fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />;
  } else if (mood === 'calm') {
    mouth = <path d={`M${cx - 5} ${my} Q${cx} ${my + 4} ${cx + 5} ${my}`} fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />;
  } else {
    mouth = <path d={`M${cx - 7} ${my - 1} Q${cx} ${my + 7} ${cx + 7} ${my - 1}`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />;
  }

  return (
    <>
      <ellipse cx={lx - 7} cy={y + 10} rx="4.5" ry="2.8" fill={BLUSH} />
      <ellipse cx={rx + 7} cy={y + 10} rx="4.5" ry="2.8" fill={BLUSH} />
      {eyes}
      {mouth}
    </>
  );
}

function Shadow() {
  return <ellipse cx="60" cy="138" rx="28" ry="4" fill={INK} opacity={0.12} />;
}

function EmberArt({ mood }: { mood: MascotMood }) {
  const armsUp = mood === 'cheer';
  return (
    <>
      <Shadow />
      <g fill="none" stroke={LIMB} strokeWidth={3.5} strokeLinecap="round">
        <path d="M50 122 L45 136" />
        <path d="M70 122 L75 136" />
        <path d={armsUp ? 'M25 88 L12 68' : 'M24 92 L12 102'} />
        <path d={armsUp ? 'M95 88 L108 68' : 'M96 92 L108 102'} />
      </g>
      <path
        d="M60 8 C72 30 98 44 98 82 C98 108 80 124 60 124 C40 124 22 108 22 82 C22 62 34 52 40 40 C44 52 49 56 54 56 C52 40 54 22 60 8 Z"
        fill="#e6f04a"
        stroke={INK}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path d="M60 58 C70 70 82 78 82 95 C82 109 72 117 60 117 C48 117 38 109 38 96 C38 83 52 77 60 58 Z" fill="#fffbe0" />
      <Face mood={mood} lx={49} rx={71} y={88} />
    </>
  );
}

/** Timber (Physical): a stocky log that flexes. Thick arms, big biceps, sweatband. */
function Limb({ d }: { d: string }) {
  // Outlined thick limb: a wide ink stroke under a narrower bark stroke.
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#c98a55" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function TimberArt({ mood }: { mood: MascotMood }) {
  const flexing = mood === 'happy' || mood === 'cheer';
  return (
    <>
      <Shadow />
      <g fill="none" stroke={LIMB} strokeWidth={6} strokeLinecap="round">
        <path d="M48 124 L45 137" />
        <path d="M72 124 L75 137" />
      </g>

      {flexing ? (
        <>
          <Limb d="M32 76 L12 80 L9 52" />
          <Limb d="M88 76 L108 80 L111 52" />
          <g fill="#c98a55" stroke={INK} strokeWidth={2.5}>
            <ellipse cx="20" cy="72" rx="10" ry="8" />
            <ellipse cx="100" cy="72" rx="10" ry="8" />
          </g>
          <g fill="#f2d3a6" stroke={INK} strokeWidth={2.5}>
            <circle cx="9" cy="48" r="7" />
            <circle cx="111" cy="48" r="7" />
          </g>
        </>
      ) : (
        <>
          <Limb d="M32 82 L20 108" />
          <Limb d="M88 82 L100 108" />
        </>
      )}

      <path
        d="M26 52 L94 52 Q98 92 86 124 L34 124 Q22 92 26 52 Z"
        fill="#c98a55"
        stroke={INK}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <g stroke={INK} strokeWidth={1.5} strokeLinecap="round" opacity={0.35}>
        <path d="M36 82 L38 114" />
        <path d="M84 82 L82 114" />
      </g>
      <ellipse cx="60" cy="52" rx="35" ry="11" fill="#f2d3a6" stroke={INK} strokeWidth={2.5} />
      <ellipse cx="60" cy="52" rx="20" ry="6" fill="none" stroke={INK} strokeWidth={1.5} />
      <ellipse cx="60" cy="52" rx="7" ry="2.3" fill="none" stroke={INK} strokeWidth={1.5} />
      <path d="M76 46 Q86 36 84 26" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      <ellipse cx="86" cy="24" rx="7" ry="4" fill="#7ac69a" stroke={INK} strokeWidth={1.5} transform="rotate(-30 86 24)" />

      <path d="M25 64 Q60 56 95 64 L96 74 Q60 66 25 74 Z" fill="#d3f5df" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M26 68 L14 61 L15 74 Z" fill="#d3f5df" stroke={INK} strokeWidth={2} strokeLinejoin="round" />

      {mood !== 'sleepy' && (
        <g stroke={INK} strokeWidth={3} strokeLinecap="round">
          <path d="M42 83 L54 87" />
          <path d="M78 83 L66 87" />
        </g>
      )}
      <Face mood={mood} lx={48} rx={72} y={95} />
    </>
  );
}

/** Sparky (Work): a lit matchstick nerd. Thick round glasses, buck teeth, bowtie, a book. */
function SparkyArt({ mood }: { mood: MascotMood }) {
  const cheer = mood === 'cheer';
  return (
    <>
      <Shadow />
      <g fill="none" stroke={LIMB} strokeWidth={3.5} strokeLinecap="round">
        <path d="M52 126 L48 137" />
        <path d="M68 126 L72 137" />
        <path d={cheer ? 'M40 96 L26 76' : 'M40 98 L28 106'} />
        <path d="M80 98 L92 104" />
      </g>

      <rect x="38" y="54" width="44" height="74" rx="12" fill="#f7e7c4" stroke={INK} strokeWidth={2.5} />
      <ellipse cx="60" cy="44" rx="25" ry="20" fill="#a8401f" stroke={INK} strokeWidth={2.5} />
      <path d="M50 36 Q56 30 64 32" fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
      {mood !== 'sleepy' && (
        <path
          d="M60 2 C66 10 72 16 72 24 C72 30 67 34 60 34 C53 34 48 30 48 24 C48 16 54 10 60 2 Z"
          fill="#e6f04a"
          stroke={INK}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}

      <g stroke={INK} strokeWidth={3} fill="#ffffff" fillOpacity={0.6}>
        <circle cx="50" cy="76" r="9.5" />
        <circle cx="70" cy="76" r="9.5" />
        <path d="M59.5 75 Q60 73 60.5 75" fill="none" />
        <path d="M40.5 74 L36 72" />
        <path d="M79.5 74 L84 72" />
      </g>
      {mood === 'sleepy' ? (
        <g fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round">
          <path d="M46 76 Q50 79 54 76" />
          <path d="M66 76 Q70 79 74 76" />
        </g>
      ) : (
        <g fill={INK}>
          <circle cx="50" cy="76" r="3.2" />
          <circle cx="70" cy="76" r="3.2" />
        </g>
      )}
      <path d="M52 91 Q60 98 68 91" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      <rect x="56.5" y="93" width="7" height="5" rx="1" fill="#ffffff" stroke={INK} strokeWidth={1.5} />

      <path d="M60 106 L50 101 L50 111 Z M60 106 L70 101 L70 111 Z" fill="#e6dfff" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <circle cx="60" cy="106" r="2.5" fill="#5b47d6" stroke={INK} strokeWidth={1.5} />

      <g transform="rotate(-12 98 104)">
        <rect x="86" y="92" width="24" height="28" rx="3" fill="#5b47d6" stroke={INK} strokeWidth={2.5} />
        <path d="M91 100 L105 100 M91 106 L101 106" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      </g>
    </>
  );
}

/** Glow (Soul): a candle that radiates good mood. Wide smile, waving arm, light rays. */
function GlowArt({ mood }: { mood: MascotMood }) {
  const bothUp = mood === 'cheer';
  return (
    <>
      <Shadow />
      <g fill="none" stroke={LIMB} strokeWidth={3.5} strokeLinecap="round">
        <path d="M50 128 L46 137" />
        <path d="M70 128 L74 137" />
        <path d={bothUp ? 'M36 92 L20 72' : 'M36 98 L24 108'} />
        <path d="M84 92 L100 70" />
        <path d="M100 70 L106 64 M100 70 L108 72" strokeWidth={3} />
      </g>

      {mood !== 'sleepy' && (
        <g stroke="#3b7ddd" strokeWidth={3} strokeLinecap="round">
          <path d="M60 5 L60 -1" />
          <path d="M38 18 L33 13" />
          <path d="M82 18 L87 13" />
        </g>
      )}
      <path
        d="M60 12 C68 22 74 30 74 40 C74 48 68 54 60 54 C52 54 46 48 46 40 C46 30 52 22 60 12 Z"
        fill="#e6f04a"
        stroke={INK}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path d="M60 30 C64 35 66 39 66 43 C66 47 63 50 60 50 C57 50 54 47 54 43 C54 39 56 35 60 30 Z" fill="#fffbe0" />
      <path d="M60 54 L60 62" stroke={INK} strokeWidth={2.5} />

      <path d="M36 62 L84 62 L84 128 Q60 134 36 128 Z" fill="#ffffff" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <path
        d="M36 62 L84 62 L84 70 Q80 82 76 70 Q70 84 64 70 Q58 80 52 70 Q46 86 42 70 Q39 76 36 70 Z"
        fill="#dcebff"
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Face mood={mood} lx={50} rx={70} y={94} alwaysOpen={mood !== 'sleepy'} />
    </>
  );
}

/**
 * The Kindling campfire family. Ember is the guide who talks to the user; Timber, Sparky
 * and Glow stand for the three pillars. Moods follow the day (sleepy on a gentle
 * day, cheering when a win lands), so the characters reflect the user's state instead of
 * decorating the page. Decorative: the surrounding text carries the meaning.
 */
export function Mascot({ mood = 'happy', pillar, className = 'h-24 w-20' }: MascotProps) {
  return (
    <svg viewBox="0 -4 120 148" className={className} aria-hidden="true" focusable="false">
      {pillar === 'physical' ? (
        <TimberArt mood={mood} />
      ) : pillar === 'work' ? (
        <SparkyArt mood={mood} />
      ) : pillar === 'soul' ? (
        <GlowArt mood={mood} />
      ) : (
        <EmberArt mood={mood} />
      )}
    </svg>
  );
}
