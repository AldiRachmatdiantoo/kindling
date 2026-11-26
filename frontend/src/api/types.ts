export interface ApiMeta {
  request_id: string;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  success: false;
  error: ApiErrorBody;
  meta?: ApiMeta;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  timezone: string;
}

export interface AuthData {
  user: User;
}

export type CalibrationTier = 'gentle' | 'balanced' | 'standard';

export type BriefCopeCategory =
  | 'active_coping'
  | 'planning'
  | 'positive_reframing'
  | 'acceptance'
  | 'humor'
  | 'religion'
  | 'emotional_support'
  | 'instrumental_support'
  | 'self_distraction'
  | 'venting';

export type CopeToolType = 'breathing' | 'timer' | 'brain_dump';

export type Pillar = 'physical' | 'work' | 'soul';

export type HeatmapLevel = 'rest' | 'recovery' | 'steady' | 'complete';

export interface CheckinAnswers {
  cbi_1: number;
  cbi_2: number;
  cbi_3: number;
  olbi_ex_1: number;
  olbi_ex_2: number;
  olbi_dis_1: number;
  olbi_dis_2: number;
  who5_1: number;
  who5_2: number;
}

export interface Scores {
  physical_exhaustion: number;
  work_exhaustion: number;
  disengagement: number;
  soul_wellbeing: number;
}

export interface CopeOption {
  id: string;
  title: string;
  brief_cope_category: BriefCopeCategory;
  tool_type: CopeToolType;
  duration_seconds: number;
  guidance: string;
}

export interface WinItem {
  title: string;
  level: number;
  completed: boolean;
}

export interface WorkWinItem extends WinItem {
  main_task: string | null;
  micro_step: string | null;
  duration_seconds: number | null;
}

export interface WinsData {
  physical: WinItem;
  work: WorkWinItem;
  soul: WinItem;
}

export interface DailyLog {
  id: string;
  log_date: string;
  scores: Scores;
  calibration_tier: CalibrationTier;
  diagnostic_summary: string;
  safety_flag: boolean;
  cope_options: CopeOption[];
  positive_cope_chosen: string | null;
  wins_data: WinsData;
  wins_completed_count: number;
}

export interface SliceTaskData {
  main_task: string;
  micro_step: string;
  duration_seconds: number;
}

export interface RecalibrateData {
  pillar: Pillar;
  new_title: string;
  level: number;
  duration_seconds?: number;
}

export interface ToggleWinData {
  pillar: Pillar;
  completed: boolean;
  wins_completed_count: number;
}

export interface HeatmapRange {
  from: string;
  to: string;
}

export interface ProfileMilestones {
  total_active_days: number;
  total_complete_days: number;
  total_recovery_days: number;
  total_daily_wins: number;
}

export interface HeatmapDay {
  date: string;
  level: HeatmapLevel;
  wins_count: number;
  cope_chosen: string | null;
}

export interface HeatmapData {
  range: HeatmapRange;
  milestones: ProfileMilestones;
  days: HeatmapDay[];
}
