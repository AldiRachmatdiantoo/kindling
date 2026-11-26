import type { CalibrationTier, Scores } from '../../api/types';
import type { MascotMood } from '../../components/Mascot';

/** Shared labels and colors for the calibration tier, used by Today and the Energy Map. */
export const TIER_META: Record<
  CalibrationTier,
  { label: string; badgeClass: string; desc: string }
> = {
  gentle: {
    label: 'Gentle Mode',
    badgeClass: 'border-sky-strong bg-sky text-sky-strong',
    desc: 'Goals are as small as they get today, so your nervous system can recover.',
  },
  balanced: {
    label: 'Balanced Mode',
    badgeClass: 'border-lavender-strong bg-lavender text-lavender-strong',
    desc: 'Light-to-moderate goals that keep you moving without wearing you out.',
  },
  standard: {
    label: 'Standard Mode',
    badgeClass: 'border-mint-strong bg-mint text-mint-strong',
    desc: 'Your energy is steady enough for regular-sized goals today.',
  },
};

/** Ember mirrors the day's energy mode: sleepy on a gentle day, bright on a standard one. */
export const TIER_MOOD: Record<CalibrationTier, MascotMood> = {
  gentle: 'sleepy',
  balanced: 'calm',
  standard: 'happy',
};

/**
 * The line Ember opens the day with. It quotes the real reading, so Preset A and Preset B
 * sound as different as they are: one is out of fuel, the other is running but far away.
 */
export function moodGreeting(tier: CalibrationTier, scores: Scores): string {
  const bodyEnergy = Math.max(0, Math.min(100, Math.round(100 - scores.physical_exhaustion)));
  if (tier === 'gentle') {
    return `Your physical energy is at ${bodyEnergy}%. No heavy targets today. We're just keeping your small spark lit.`;
  }
  if (tier === 'balanced') {
    if (scores.disengagement >= 60) {
      return `Your body still has ${bodyEnergy}% in the tank, but work feels far away right now. Today is about small things that feel like yours again.`;
    }
    return `Your physical energy is at ${bodyEnergy}%. Light, steady steps today, and a little room to breathe.`;
  }
  return `Your physical energy is at ${bodyEnergy}%. Good fuel for regular-sized goals, at your own pace.`;
}
