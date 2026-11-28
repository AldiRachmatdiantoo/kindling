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
    // One win shows in the panel at a time; the pending state follows each pillar.
    fireEvent.click(await screen.findByTestId('win-toggle-physical'));
    expect(screen.getByTestId('win-toggle-physical')).toBeDisabled();

    fireEvent.click(screen.getByTestId('win-row-work'));
    fireEvent.click(screen.getByTestId('win-toggle-work'));
    expect(screen.getByTestId('win-toggle-work')).toBeDisabled();

    fireEvent.click(screen.getByTestId('win-row-soul'));
    expect(screen.getByTestId('win-toggle-soul')).not.toBeDisabled();

    // Resolving physical should keep work disabled until work resolves
    resolvePhysical({ pillar: 'physical', completed: true, wins_completed_count: 1 });
    fireEvent.click(screen.getByTestId('win-row-physical'));
    await waitFor(() => expect(screen.getByTestId('win-toggle-physical')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('win-row-work'));
    expect(screen.getByTestId('win-toggle-work')).toBeDisabled();

    resolveWork({ pillar: 'work', completed: true, wins_completed_count: 2 });
    await waitFor(() => expect(screen.getByTestId('win-toggle-work')).not.toBeDisabled());
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

    // The panel opens on the first win still to do.
    await screen.findByTestId('win-card-work');
    expect(screen.getByTestId('recalibrate-work')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('win-row-physical'));
    await screen.findByTestId('win-card-physical');
    expect(screen.queryByTestId('recalibrate-physical')).not.toBeInTheDocument();
    expect(screen.getByTestId('win-row-state-physical')).toHaveTextContent('Done');
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

    // Kept open (not completed) so "Still too heavy" stays available for the second half.
    const toggle = vi
      .spyOn(winsApi, 'toggle')
      .mockResolvedValue({ pillar: 'work', completed: false, wins_completed_count: 0 });

    renderWins();
    fireEvent.click(await screen.findByTestId('win-row-work'));
    // The current tiny step shows big with its own Done; finishing the first one is the win.
    expect(await screen.findByTestId('work-micro-step')).toHaveTextContent('Open the document');
    fireEvent.click(screen.getByTestId('work-step-done'));
    expect(screen.getByTestId('work-step-choice')).toBeInTheDocument();
    expect(toggle).toHaveBeenCalledWith('2026-11-26', 'work', true);

    // Slicing a new task resets finishedStep
    fireEvent.click(screen.getByTestId('work-change-task'));
    fireEvent.change(screen.getByTestId('slice-task-input'), { target: { value: 'New task' } });
    fireEvent.submit(screen.getByTestId('slice-task-form'));

    await waitFor(() => expect(screen.queryByTestId('work-step-choice')).not.toBeInTheDocument());
    fireEvent.click(await screen.findByTestId('task-morph-close'));

    // Done again, then recalibrate work -> finishedStep resets again
    await waitFor(() => expect(screen.getByTestId('work-step-done')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('work-step-done'));
    expect(screen.getByTestId('work-step-choice')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recalibrate-work'));
    await waitFor(() => expect(screen.queryByTestId('work-step-choice')).not.toBeInTheDocument());
  });

  it('asks for the task first when work has none yet', async () => {
    renderWins(
      makeLog({
        wins_data: {
          ...makeLog().wins_data,
          work: {
            title: 'Pick one work task',
            level: 0,
            completed: false,
            main_task: null,
            micro_step: null,
            duration_seconds: null,
          },
        },
      }),
    );
    fireEvent.click(await screen.findByTestId('win-row-work'));
    expect(screen.getByTestId('slice-task-input')).toBeInTheDocument();
    expect(screen.getByTestId('roadmap-floor-work')).toHaveTextContent(
      "Today's win counts from here",
    );
    expect(screen.queryByTestId('work-step-done')).toBeNull();
  });

  it('loads the Milestone Path totals only when the third win lands', async () => {
    // Generous waits: the full suite runs many jsdom files at once.
    const WAIT = { timeout: 6000 };
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
      fireEvent.click(await screen.findByTestId('win-row-' + pillar, {}, WAIT));
      fireEvent.click(await screen.findByTestId('win-toggle-' + pillar, {}, WAIT));
      // A celebration only closes once its animation has played out.
      await waitFor(
        () => expect(screen.getByTestId('win-celebration')).toHaveAttribute('data-ready', 'true'),
        WAIT,
      );
      fireEvent.click(screen.getByTestId('win-celebration-close'));
      await waitFor(() => expect(screen.queryByTestId('win-celebration')).toBeNull(), WAIT);
    }
    expect(heatmap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('win-row-soul'));
    fireEvent.click(screen.getByTestId('win-toggle-soul'));
    await waitFor(
      () => expect(screen.getByTestId('win-celebration')).toHaveAttribute('data-kind', 'all'),
      WAIT,
    );
    await waitFor(() => expect(heatmap).toHaveBeenCalledTimes(1), WAIT);
  }, 20000);

  describe('roadmap wins', () => {
    const steps = ['Put on your gym clothes', 'Pack your bag', 'Get to the gym', 'Do your workout'];
    const roadmapLog = (stepsDone: number) =>
      makeLog({
        wins_data: {
          ...makeLog().wins_data,
          physical: {
            title: 'Go to the gym',
            level: 0,
            completed: stepsDone >= 3,
            habit: 'gym',
            steps,
            floor_step: 3,
            steps_done: stepsDone,
          },
        },
      });

    it('shows one step at a time and counts the win from the floor step', async () => {
      const progress = vi
        .spyOn(winsApi, 'progress')
        .mockImplementation(async (_date, pillar, stepsDone) => ({
          pillar,
          steps_done: stepsDone,
          completed: stepsDone >= 3,
          wins_completed_count: stepsDone >= 3 ? 1 : 0,
        }));

      renderWins(roadmapLog(1));
      expect(await screen.findByTestId('roadmap-current-physical')).toHaveTextContent(
        'Pack your bag',
      );
      expect(screen.getByTestId('roadmap-floor-physical')).toHaveTextContent(
        "Today's win counts from here",
      );
      expect(screen.getByTestId('win-row-state-physical')).toHaveTextContent('Step 2 of 4');

      fireEvent.click(screen.getByTestId('roadmap-done-physical'));
      await waitFor(() =>
        expect(screen.getByTestId('roadmap-current-physical')).toHaveTextContent('Get to the gym'),
      );
      expect(progress).toHaveBeenLastCalledWith('2026-11-26', 'physical', 2);
      expect(screen.queryByTestId('win-celebration')).toBeNull();

      fireEvent.click(screen.getByTestId('roadmap-done-physical'));
      await waitFor(() =>
        expect(screen.getByTestId('roadmap-floor-physical')).toHaveAttribute(
          'data-reached',
          'true',
        ),
      );
      expect(screen.getByTestId('roadmap-note-physical')).toHaveTextContent("Today's win is in.");
      expect(screen.getByTestId('win-row-state-physical')).toHaveTextContent(
        'Win in · Step 4 of 4',
      );
      expect(await screen.findByTestId('win-celebration')).toHaveAttribute('data-kind', 'win');
    });

    it('splits the current step when it is too big', async () => {
      const split = vi.spyOn(winsApi, 'splitStep').mockResolvedValue({
        pillar: 'physical',
        steps: [steps[0], 'Put your shoes on', 'Grab your bag and go', ...steps.slice(2)],
        floor_step: 4,
        steps_done: 1,
      });

      renderWins(roadmapLog(1));
      fireEvent.click(await screen.findByTestId('roadmap-smaller-physical'));
      await waitFor(() =>
        expect(screen.getByTestId('roadmap-current-physical')).toHaveTextContent(
          'Put your shoes on',
        ),
      );
      expect(split).toHaveBeenCalledWith('2026-11-26', 'physical', 1, expect.any(String));
      expect(screen.getByTestId('roadmap-count-physical')).toHaveTextContent('Step 2 of 5');
    });

    it('stopping before the floor is saved as started, kindly', async () => {
      renderWins(roadmapLog(2));
      fireEvent.click(await screen.findByTestId('roadmap-stop-physical'));
      expect(screen.getByTestId('roadmap-note-physical')).toHaveTextContent(
        'You got to step 2 today.',
      );
      expect(screen.getByTestId('roadmap-note-physical')).toHaveTextContent('saved as started');
      expect(screen.queryByTestId('roadmap-done-physical')).toBeNull();

      fireEvent.click(screen.getByTestId('roadmap-resume-physical'));
      expect(screen.getByTestId('roadmap-done-physical')).toBeInTheDocument();
    });

    it('on phones the panel replaces the list until going back', async () => {
      renderWins(roadmapLog(0));
      fireEvent.click(await screen.findByTestId('win-row-physical'));
      expect(screen.getByTestId('wins-list')).toHaveClass('hidden');
      expect(screen.getByTestId('wins-detail')).not.toHaveClass('hidden');

      fireEvent.click(screen.getByTestId('wins-back'));
      expect(screen.getByTestId('wins-list')).not.toHaveClass('hidden');
      expect(screen.getByTestId('wins-detail')).toHaveClass('hidden');
    });
  });
});
