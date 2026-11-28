import type { Pillar } from '../../api/types';

/**
 * Appreciation notes behind each checkpoint chest. Fixed text, picked by pillar and
 * checkpoint number, so the same chest always says the same thing. They thank, they never
 * promise a prize or ask the user to come back.
 */
const NOTES: Record<Pillar, string[]> = {
  physical: [
    'You looked after your body again and again. That care counts, however small each step felt.',
    'Moving, resting, stretching: your body noticed every one of these moments.',
    'You keep making room for your body, even on full days. That is quiet strength.',
    'Each of these wins was a small kindness to yourself. Thank you for showing up for you.',
    'Look at this stretch of path. It was built one gentle step at a time.',
    'Your body carries you through everything. You have been carrying it back.',
  ],
  work: [
    'Tiny steps broke heavy tasks open. Starting is the hardest part, and you did it.',
    'You picked things up instead of letting them weigh on you. That matters.',
    'Small steps still move things. You have proof of that right here.',
    'You kept your focus kind and small. That is how real progress usually looks.',
    'Every one of these was a moment of choosing to begin. Thank you for each of them.',
    'Your work deserves a person who is rested and steady. You are making room for both.',
  ],
  soul: [
    'Quiet moments that were just for you. They were never a waste of time.',
    'You gave your mind some space, more than once. That kind of care adds up.',
    'You keep coming back to what calms you. That is a gift you give yourself.',
    'Rest, wonder, a small joy: each one here was worth having.',
    'This part of the path is made of moments you chose for your own peace.',
    'Being gentle with yourself is a skill. You have been practicing it.',
  ],
};

export function appreciationNote(pillar: Pillar, checkpointNumber: number): string {
  const notes = NOTES[pillar];
  const index = (Math.max(1, Math.floor(checkpointNumber)) - 1) % notes.length;
  return notes[index];
}
