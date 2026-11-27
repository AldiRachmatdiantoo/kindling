import type { CheckinAnswers } from '../../api/types';

export interface CheckinQuestion {
  key: keyof CheckinAnswers;
  dimension: 'Physical' | 'Work Exhaustion' | 'Disengagement' | 'Soul';
  text: string;
}

export const LIKERT_LABELS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Not at all' },
  { value: 2, label: 'A little' },
  { value: 3, label: 'Quite a bit' },
  { value: 4, label: 'Very much' },
];

export const CHECKIN_QUESTIONS: CheckinQuestion[] = [
  {
    key: 'cbi_1',
    dimension: 'Physical',
    text: 'My body feels tired or achy today.',
  },
  {
    key: 'cbi_2',
    dimension: 'Physical',
    text: 'I feel physically drained before the day has even started.',
  },
  {
    key: 'cbi_3',
    dimension: 'Physical',
    text: 'I have no energy left for anything beyond what I have to do.',
  },
  {
    key: 'olbi_ex_1',
    dimension: 'Work Exhaustion',
    text: 'After work or study, it takes me a long time to recover.',
  },
  {
    key: 'olbi_ex_2',
    dimension: 'Work Exhaustion',
    text: 'While working or studying, I often feel emotionally drained.',
  },
  {
    key: 'olbi_dis_1',
    dimension: 'Disengagement',
    text: 'I get through my tasks on autopilot, without really being there.',
  },
  {
    key: 'olbi_dis_2',
    dimension: 'Disengagement',
    text: 'My work or studies feel less and less meaningful to me.',
  },
  {
    key: 'who5_1',
    dimension: 'Soul',
    text: 'Today I feel fairly cheerful and in good spirits.',
  },
  {
    key: 'who5_2',
    dimension: 'Soul',
    text: 'Today I feel calm and relaxed.',
  },
];

export interface DemoPreset {
  id: 'preset-a' | 'preset-b';
  label: string;
  description: string;
  answers: CheckinAnswers;
  brain_dump: string;
  fun_cope_input: string;
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'preset-a',
    label: 'Preset A: High Exhaustion',
    description: 'High physical and work exhaustion (gentle tier)',
    answers: {
      cbi_1: 4,
      cbi_2: 4,
      cbi_3: 4,
      olbi_ex_1: 4,
      olbi_ex_2: 4,
      olbi_dis_1: 2,
      olbi_dis_2: 1,
      who5_1: 2,
      who5_2: 1,
    },
    brain_dump:
      'Deadlines are piling up, I have barely slept for three days, and my body feels wrecked.',
    fun_cope_input: 'Lying down and listening to my favorite songs',
  },
  {
    id: 'preset-b',
    label: 'Preset B: High Disengagement',
    description: 'Feeling empty and checked out (balanced tier)',
    answers: {
      cbi_1: 2,
      cbi_2: 2,
      cbi_3: 1,
      olbi_ex_1: 2,
      olbi_ex_2: 2,
      olbi_dis_1: 4,
      olbi_dis_2: 4,
      who5_1: 2,
      who5_2: 2,
    },
    brain_dump: 'I still get everything done, but it all feels empty and pointless.',
    fun_cope_input: 'Playing a cozy game or doodling whatever comes to mind',
  },
];
