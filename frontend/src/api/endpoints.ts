import { apiRequest } from './client';
import type {
  AuthData,
  CheckinAnswers,
  DailyLog,
  HeatmapData,
  Pillar,
  RecalibrateData,
  SliceTaskData,
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
  getToday: () => apiRequest<DailyLog>('/checkin/today', { method: 'GET' }),

  getByDate: (date: string) => apiRequest<DailyLog>(`/checkin/${date}`, { method: 'GET' }),

  submit: (
    payload: {
      log_date: string;
      answers: CheckinAnswers;
      brain_dump: string;
      fun_cope_input: string;
    },
    idempotencyKey?: string
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
};

export const winsApi = {
  sliceTask: (date: string, mainTask: string, idempotencyKey?: string) =>
    apiRequest<SliceTaskData>(`/wins/${date}/slice-task`, {
      method: 'POST',
      body: { main_task: mainTask },
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

  toggle: (date: string, pillar: Pillar, completed: boolean) =>
    apiRequest<ToggleWinData>(`/wins/${date}/toggle`, {
      method: 'PATCH',
      body: { pillar, completed },
    }),
};

export const profileApi = {
  getHeatmap: () => apiRequest<HeatmapData>('/profile/heatmap', { method: 'GET' }),
};
