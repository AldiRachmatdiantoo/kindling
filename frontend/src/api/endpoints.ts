import { apiRequest } from './client';
import type {
  AuthData,
  CheckinAnswers,
  DailyLog,
  HabitsData,
  HeatmapData,
  InsightsData,
  Pillar,
  RecalibrateData,
  ReflectData,
  SliceTaskData,
  SwapWinData,
  ToggleWinData,
} from './types';

export const authApi = {
  me: () => apiRequest<AuthData>('/auth/me', { method: 'GET' }),

  login: (payload: { email: string; password: string }) =>
    apiRequest<AuthData>('/auth/login', {
      method: 'POST',
      body: payload,
    }),

  register: (payload: {
    email: string;
    password: string;
    full_name: string;
    timezone?: string;
    ai_consent: true;
  }) =>
    apiRequest<AuthData>('/auth/register', {
      method: 'POST',
      body: payload,
    }),

  logout: () =>
    apiRequest<{ logged_out: true }>('/auth/logout', {
      method: 'POST',
    }),
};

export const checkinApi = {
  // The shell, the landing redirect, and the page itself can all ask for today's log in the
  // same tick; apiRequest shares overlapping reads, so a page load costs one call, not three.
  getToday: () => apiRequest<DailyLog>('/checkin/today', { method: 'GET' }),

  getByDate: (date: string) => apiRequest<DailyLog>(`/checkin/${date}`, { method: 'GET' }),

  submit: (
    payload: {
      log_date: string;
      answers: CheckinAnswers;
      brain_dump: string;
      fun_cope_input: string;
    },
    idempotencyKey?: string,
  ) =>
    apiRequest<DailyLog>('/checkin', {
      method: 'POST',
      body: payload,
      idempotent: true,
      idempotencyKey,
    }),

  chooseCope: (date: string, copeOptionId: string) =>
    apiRequest<{ positive_cope_chosen: string }>(`/checkin/${date}/cope`, {
      method: 'PATCH',
      body: { cope_option_id: copeOptionId },
    }),

  /**
   * Sends a brain dump to the AI for a one-time read-back. Only call this after the user
   * chose it: `consent: true` is the record of that choice. The text is not stored.
   */
  reflect: (date: string, text: string, idempotencyKey?: string) =>
    apiRequest<ReflectData>(`/checkin/${date}/reflect`, {
      method: 'POST',
      body: { text, consent: true },
      idempotent: true,
      idempotencyKey,
    }),
};

export const winsApi = {
  /** nextStep asks for the step after the current micro-step, which the user just finished. */
  sliceTask: (date: string, mainTask: string, idempotencyKey?: string, nextStep = false) =>
    apiRequest<SliceTaskData>(`/wins/${date}/slice-task`, {
      method: 'POST',
      body: nextStep ? { main_task: mainTask, next_step: true } : { main_task: mainTask },
      idempotent: true,
      idempotencyKey,
    }),

  recalibrate: (date: string, pillar: Pillar, idempotencyKey?: string) =>
    apiRequest<RecalibrateData>(`/wins/${date}/recalibrate`, {
      method: 'POST',
      body: { pillar },
      idempotent: true,
      idempotencyKey,
    }),

  /** Trade a physical or soul win for another activity, for today only. */
  swap: (date: string, pillar: Pillar, activity: string, idempotencyKey?: string) =>
    apiRequest<SwapWinData>(`/wins/${date}/swap`, {
      method: 'POST',
      body: { pillar, activity },
      idempotent: true,
      idempotencyKey,
    }),

  toggle: (date: string, pillar: Pillar, completed: boolean) =>
    apiRequest<ToggleWinData>(`/wins/${date}/toggle`, {
      method: 'PATCH',
      body: { pillar, completed },
    }),
};

export const habitsApi = {
  get: () => apiRequest<HabitsData>('/habits', { method: 'GET' }),
  /** Saves all three pillars at once; a null or empty activity clears that pillar. */
  put: (habits: HabitsData) => apiRequest<HabitsData>('/habits', { method: 'PUT', body: habits }),
};

export const profileApi = {
  getHeatmap: () => apiRequest<HeatmapData>('/profile/heatmap', { method: 'GET' }),
  getInsights: () => apiRequest<InsightsData>('/profile/insights', { method: 'GET' }),
};
