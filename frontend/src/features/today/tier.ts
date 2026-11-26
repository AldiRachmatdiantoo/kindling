import type { CalibrationTier } from '../../api/types';
import type { MascotMood } from '../../components/Mascot';

/** Shared labels and colors for the calibration tier, used by Today and the Energy Map. */
export const TIER_META: Record<CalibrationTier, { label: string; badgeClass: string; desc: string }> = {
  gentle: {
    label: 'Gentle Mode',
    badgeClass: 'bg-sky',
    desc: "Goals are as small as they get today, so your nervous system can recover.",
  },
  balanced: {
    label: 'Balanced Mode',
    badgeClass: 'bg-lavender',
    desc: "Light-to-moderate goals that keep you moving without wearing you out.",
  },
  standard: {
    label: 'Standard Mode',
    badgeClass: 'bg-mint',
    desc: "Your energy is steady enough for regular-sized goals today.",
  },
};

/** Ember mirrors the day's energy mode: sleepy on a gentle day, bright on a standard one. */
export const TIER_MOOD: Record<CalibrationTier, MascotMood> = {
  gentle: 'sleepy',
  balanced: 'calm',
  standard: 'happy',
};
