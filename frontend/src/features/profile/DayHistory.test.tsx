import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { checkinApi } from '../../api/endpoints';
import type { DailyLog, HeatmapDay } from '../../api/types';
import { DayDetail, formatLongDate, RecentDays, recentActiveDays } from './DayHistory';

const days: HeatmapDay[] = [
  { date: '2026-11-20', level: 'recovery', wins_count: 0, cope_chosen: '4-7-8 Breathing' },
  { date: '2026-11-21', level: 'rest', wins_count: 0, cope_chosen: null },
  { date: '2026-11-26', level: 'complete', wins_count: 3, cope_chosen: 'Chill Time' },
];

const log: DailyLog = {
  id: 'log-1',
  log_date: '2026-11-26',
  scores: { physical_exhaustion: 89, work_exhaustion: 70, disengagement: 40, soul_wellbeing: 30 },
  calibration_tier: 'gentle',
  diagnostic_summary: 'Your energy is running low, and that is completely okay.',
  safety_flag: false,
  cope_options: [],
  positive_cope_chosen: '4-7-8 Breathing',
  wins_data: {
    physical: { title: 'Take a 5-minute stroll', level: 1, completed: true },
    work: {
      title: 'Pick 1 task',
      level: 0,
      completed: false,
      main_task: 'Slides',
      micro_step: 'Open the slide deck and add a title',
      duration_seconds: 300,
    },
    soul: { title: 'Listen to one calming song', level: 0, completed: true },
  },
  wins_completed_count: 2,
};

afterEach(() => vi.restoreAllMocks());

describe('Day history', () => {
  it('lists only days with something logged, newest first', () => {
    expect(recentActiveDays(days).map((d) => d.date)).toEqual(['2026-11-26', '2026-11-20']);
  });

  it('formats long dates stably in UTC without timezone day-shift', () => {
    expect(formatLongDate('2026-11-26')).toBe('Thursday, November 26, 2026');
  });

  it('opens a day from the recent list', () => {
    const onOpen = vi.fn();
    render(<RecentDays days={days} activeDate={null} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('recent-day-2026-11-20'));
    expect(onOpen).toHaveBeenCalledWith('2026-11-20');
  });

  it('shows the full log of a past day', async () => {
    vi.spyOn(checkinApi, 'getByDate').mockResolvedValue(log);
    render(<DayDetail date="2026-11-26" onClose={() => {}} />);

    expect(await screen.findByText('What I noticed that day')).toBeInTheDocument();
    expect(screen.getByTestId('day-detail-tier')).toHaveTextContent('Gentle Mode');
    expect(screen.getByTestId('day-detail-wins-count')).toHaveTextContent('2/3 wins');
    expect(screen.getByTestId('day-detail-cope')).toHaveTextContent('4-7-8 Breathing');
    expect(screen.getByTestId('day-detail-win-physical')).toHaveTextContent('Made lighter 1x');
    expect(screen.getByTestId('day-detail-win-work')).toHaveTextContent('Not done');
    expect(screen.getByTestId('day-detail-win-work')).toHaveTextContent(
      'Tiny step: Open the slide deck and add a title',
    );
  });

  it('treats a missing log as a rest day and closes on Escape', async () => {
    vi.spyOn(checkinApi, 'getByDate').mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Not found'),
    );
    const onClose = vi.fn();
    render(<DayDetail date="2026-11-21" onClose={onClose} />);

    expect(await screen.findByTestId('day-detail-rest')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('day-detail'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
