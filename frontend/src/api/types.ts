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

/** Set when a simpler template replaced the AI answer: today's cap was reached, or the AI failed. */
export type AINote = 'daily_limit' | 'unavailable';

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
  /** Why this win fits today, quoting the matching check-in score. Missing on older logs. */
  why_this?: string;
  /** Two concrete micro-steps to start without deciding anything. Missing on older logs. */
  steps?: string[];
  /** Length of the activity timer; null once the goal was made smaller. */
  duration_seconds?: number | null;
  level: number;
  completed: boolean;
  /** The user's activity this win was built from: their habit, or today's swap. */
  habit?: string;
  /** True when the user traded this win for another activity, for today only. */
  swapped?: boolean;
}

export interface WorkWinItem extends WinItem {
  main_task: string | null;
  micro_step: string | null;
  duration_seconds: number | null;
  /** Micro-steps already finished on this task before the current one. */
  steps_done?: number;
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
  /** Only on the check-in response. */
  ai_note?: AINote;
}

export interface SliceTaskData {
  main_task: string;
  micro_step: string;
  duration_seconds: number;
  steps_done: number;
  ai_note?: AINote;
}

/** A standing activity for one pillar, and what usually gets in the way. */
export interface Habit {
  activity: string;
  struggle: string;
}

/** One habit per pillar; null where none is set. */
export interface HabitsData {
  physical: Habit | null;
  work: Habit | null;
  soul: Habit | null;
}

export interface SwapWinData {
  pillar: Pillar;
  win: WinItem;
  ai_note?: AINote;
}

export interface RecalibrateData {
  pillar: Pillar;
  new_title: string;
  level: number;
  duration_seconds?: number;
  ai_note?: AINote;
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

/** One pattern found in the user's own check-ins, with the evidence size behind it. */
export interface Insight {
  id: string;
  kind: 'weekday_peak' | 'cope_next_day' | 'exhaustion_trend' | 'recovery_days' | string;
  headline: string;
  detail: string;
  sample_size: number;
}

export interface InsightsData {
  window_days: number;
  days_analyzed: number;
  min_days: number;
  insights: Insight[];
}
