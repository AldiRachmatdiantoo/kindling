import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HeatmapDay } from '../api/types';
import { HeatmapGrid } from './HeatmapGrid';

describe('HeatmapGrid', () => {
  const from = '2025-11-27';
  const to = '2026-11-26';

  const sampleDays: HeatmapDay[] = [
    {
      date: '2026-11-24',
      level: 'recovery',
      wins_count: 0,
      cope_chosen: 'Pernapasan 4-7-8',
    },
    {
      date: '2026-11-25',
      level: 'steady',
      wins_count: 2,
      cope_chosen: null,
    },
    {
      date: '2026-11-26',
      level: 'complete',
      wins_count: 3,
      cope_chosen: 'Main Gitar 10 Menit',
    },
  ];

  it('renders exactly 365 day cells and fills missing dates as rest', () => {
    render(<HeatmapGrid from={from} to={to} days={sampleDays} />);

    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(365);

    expect(screen.getByTestId('heatmap-cell-2025-11-27')).toHaveAttribute('data-level', 'rest');
    expect(screen.getByTestId('heatmap-cell-2026-11-23')).toHaveAttribute('data-level', 'rest');
    expect(screen.getByTestId('heatmap-cell-2026-11-24')).toHaveAttribute('data-level', 'recovery');
    expect(screen.getByTestId('heatmap-cell-2026-11-25')).toHaveAttribute('data-level', 'steady');
    expect(screen.getByTestId('heatmap-cell-2026-11-26')).toHaveAttribute('data-level', 'complete');
  });

  it('shows selected day details when a cell is clicked', () => {
    render(<HeatmapGrid from={from} to={to} days={sampleDays} />);

    fireEvent.click(screen.getByTestId('heatmap-cell-2026-11-26'));

    const detail = screen.getByTestId('heatmap-detail');
    expect(detail).toHaveTextContent('2026-11-26');
    expect(detail).toHaveTextContent('3/3 wins');
    expect(detail).toHaveTextContent('Main Gitar 10 Menit');
  });
});
