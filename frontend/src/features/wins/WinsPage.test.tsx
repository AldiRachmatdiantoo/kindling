import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, checkinApi, profileApi, winsApi } from '../../api/endpoints';
import type { DailyLog } from '../../api/types';
import { AuthProvider } from '../auth/AuthContext';
import { TodayStatusProvider } from '../today/TodayStatus';
import { WinsPage } from './WinsPage';

const mockUser = {
  id: 'user-1',
  email: 'test@kindling.test',
  full_name: 'Aldi Test',
  timezone: 'Asia/Jakarta',
  ai_consent_given: true,
};

function makeLog(overrides: Partial<DailyLog> = {}): DailyLog {
  return {
    id: 'log-1',
    log_date: '2026-11-26',
    scores: {
      physical_exhaustion: 60,
      work_exhaustion: 70,
      disengagement: 40,
      soul_wellbeing: 50,
    },
    calibration_tier: 'gentle',
    diagnostic_summary: 'Take it easy today.',
    safety_flag: false,
    cope_options: [],
    positive_cope_chosen: '4-7-8 Breathing',
    wins_data: {
      physical: { title: 'Stretch for 5 minutes', level: 0, completed: false },
      work: {
        title: 'Pick one work task',
        level: 0,
        completed: false,
        main_task: 'Write report',
        micro_step: 'Open the document',
        duration_seconds: 300,
        steps_done: 0,
      },
      soul: { title: 'Listen to a favorite song', level: 0, completed: false },
    },
    wins_completed_count: 0,
    ...overrides,
  };
}

function renderWins(log: DailyLog = makeLog()) {
  vi.spyOn(authApi, 'me').mockResolvedValue({ user: mockUser });
  vi.spyOn(checkinApi, 'getToday').mockResolvedValue(log);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TodayStatusProvider>
          <WinsPage />
        </TodayStatusProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('WinsPage state and UX', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks concurrent toggles per pillar independently without overwriting loading states', async () => {
    let resolvePhysical!: (value: {
      pillar: 'physical';
      completed: boolean;
      wins_completed_count: number;
    }) => void;
    let resolveWork!: (value: {
      pillar: 'work';
      completed: boolean;
      wins_completed_count: number;
    }) => void;

    vi.spyOn(winsApi, 'toggle').mockImplementation((_date, pillar) => {
      if (pillar === 'physical') {
        return new Promise((resolve) => {
          resolvePhysical = resolve;
        });
      }
      return new Promise((resolve) => {
        resolveWork = resolve;
      });
    });

    renderWins();
    const physicalBtn = await screen.findByTestId('win-toggle-physical');
    const workBtn = screen.getByTestId('win-toggle-work');
    const soulBtn = screen.getByTestId('win-toggle-soul');

    fireEvent.click(physicalBtn);
    fireEvent.click(workBtn);

    expect(physicalBtn).toBeDisabled();
    expect(workBtn).toBeDisabled();
    expect(soulBtn).not.toBeDisabled();

    // Resolving physical should keep work disabled until work resolves
    resolvePhysical({ pillar: 'physical', completed: true, wins_completed_count: 1 });
    await waitFor(() => expect(physicalBtn).not.toBeDisabled());
    expect(workBtn).toBeDisabled();

    resolveWork({ pillar: 'work', completed: true, wins_completed_count: 2 });
    await waitFor(() => expect(workBtn).not.toBeDisabled());
  });

  it('hides Still too heavy on completed win cards', async () => {
    const log = makeLog({
      wins_data: {
        physical: { title: 'Stretch for 5 minutes', level: 0, completed: true },
        work: {
          title: 'Pick one work task',
          level: 0,
          completed: false,
          main_task: null,
          micro_step: null,
          duration_seconds: null,
        },
        soul: { title: 'Listen to a favorite song', level: 0, completed: false },
      },
      wins_completed_count: 1,
    });
    renderWins(log);

    await screen.findByTestId('win-card-physical');
    expect(screen.queryByTestId('recalibrate-physical')).not.toBeInTheDocument();
    expect(screen.getByTestId('recalibrate-work')).toBeInTheDocument();
  });

  it('resets finishedStep when slicing a new task or recalibrating work', async () => {
    vi.spyOn(winsApi, 'sliceTask').mockResolvedValue({
      main_task: 'New task',
      micro_step: 'Write first bullet',
      duration_seconds: 300,
      steps_done: 0,
    });
    vi.spyOn(winsApi, 'recalibrate').mockResolvedValue({
      pillar: 'work',
      level: 1,
      new_title: 'Just open the laptop',
      duration_seconds: 180,
    });

    renderWins();
    fireEvent.click(await screen.findByTestId('win-details-toggle-work'));
    fireEvent.click(screen.getByTestId('work-step-finished-early'));
    expect(screen.getByTestId('work-step-choice')).toBeInTheDocument();

    // Slicing a new task resets finishedStep
    fireEvent.change(screen.getByTestId('slice-task-input'), { target: { value: 'New task' } });
    fireEvent.submit(screen.getByTestId('slice-task-form'));

    await waitFor(() => expect(screen.queryByTestId('work-step-choice')).not.toBeInTheDocument());
    fireEvent.click(await screen.findByTestId('task-morph-close'));

    // Mark finished early again, then recalibrate work -> finishedStep resets again
    fireEvent.click(screen.getByTestId('work-step-finished-early'));
    expect(screen.getByTestId('work-step-choice')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recalibrate-work'));
    await waitFor(() => expect(screen.queryByTestId('work-step-choice')).not.toBeInTheDocument());
  });

  it('loads the Milestone Path totals only when the third win lands', async () => {
    // Generous waits: the full suite runs many jsdom files at once.
    const WAIT = { timeout: 3000 };
    const one = {
      completed_total: 1,
      checkpoints: [],
      next_checkpoint_at: 3,
      last_completed_on: '2026-11-26',
    };
    const heatmap = vi.spyOn(profileApi, 'getHeatmap').mockResolvedValue({
      range: { from: '2026-10-30', to: '2026-11-26' },
      milestones: { total_active_days: 1, total_daily_wins: 3, total_checkpoints: 0 },
      days: [],
      pillar_progress: { physical: one, work: one, soul: one },
    } as unknown as Awaited<ReturnType<typeof profileApi.getHeatmap>>);
    let count = 0;
    vi.spyOn(winsApi, 'toggle').mockImplementation(async (_date, pillar) => {
      count += 1;
      return { pillar, completed: true, wins_completed_count: count };
    });

    renderWins();
    for (const pillar of ['physical', 'work'] as const) {
      fireEvent.click(await screen.findByTestId('win-toggle-' + pillar, {}, WAIT));
      fireEvent.click(await screen.findByTestId('win-celebration-close', {}, WAIT));
      await waitFor(() => expect(screen.queryByTestId('win-celebration')).toBeNull(), WAIT);
    }
    expect(heatmap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('win-toggle-soul'));
    await waitFor(
      () => expect(screen.getByTestId('win-celebration')).toHaveAttribute('data-kind', 'all'),
      WAIT,
    );
    await waitFor(() => expect(heatmap).toHaveBeenCalledTimes(1), WAIT);
  });
});
