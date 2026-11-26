import type { CheckinAnswers } from '../../api/types';

export interface CheckinQuestion {
  key: keyof CheckinAnswers;
  dimension: 'Physical' | 'Work Exhaustion' | 'Disengagement' | 'Soul';
  text: string;
}

export const LIKERT_LABELS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Tidak sama sekali' },
  { value: 2, label: 'Sedikit' },
  { value: 3, label: 'Cukup' },
  { value: 4, label: 'Sangat' },
];

export const CHECKIN_QUESTIONS: CheckinQuestion[] = [
  {
    key: 'cbi_1',
    dimension: 'Physical',
    text: 'Hari ini badanku terasa lelah atau pegal.',
  },
  {
    key: 'cbi_2',
    dimension: 'Physical',
    text: 'Aku merasa terkuras secara fisik bahkan sebelum hari dimulai.',
  },
  {
    key: 'cbi_3',
    dimension: 'Physical',
    text: 'Aku merasa tidak punya sisa tenaga untuk hal lain di luar kewajiban.',
  },
  {
    key: 'olbi_ex_1',
    dimension: 'Work Exhaustion',
    text: 'Setelah bekerja/belajar, aku butuh waktu lama untuk pulih.',
  },
  {
    key: 'olbi_ex_2',
    dimension: 'Work Exhaustion',
    text: 'Saat bekerja/belajar, aku sering merasa terkuras secara emosional.',
  },
  {
    key: 'olbi_dis_1',
    dimension: 'Disengagement',
    text: 'Aku mengerjakan tugas secara otomatis, tanpa merasa terlibat.',
  },
  {
    key: 'olbi_dis_2',
    dimension: 'Disengagement',
    text: 'Pekerjaan/studiku terasa makin kurang bermakna buatku.',
  },
  {
    key: 'who5_1',
    dimension: 'Soul',
    text: 'Hari ini aku merasa cukup ceria dan bersemangat.',
  },
  {
    key: 'who5_2',
    dimension: 'Soul',
    text: 'Hari ini aku merasa tenang dan rileks.',
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
    description: 'Kelelahan fisik & kerja tinggi (tier gentle)',
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
    brain_dump: 'Deadline numpuk, kurang tidur tiga hari, badan rasanya remuk.',
    fun_cope_input: 'Rebahan sambil dengerin lagu favorit',
  },
  {
    id: 'preset-b',
    label: 'Preset B: High Disengagement',
    description: 'Rasa hampa & keterlibatan rendah (tier balanced)',
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
    brain_dump: 'Aku tetap ngerjain semuanya, tapi rasanya kosong dan nggak ada artinya.',
    fun_cope_input: 'Main game santai atau gambar asal-asalan',
  },
];
