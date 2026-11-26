import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { profileApi } from '../../api/endpoints';
import type { InsightsData } from '../../api/types';
import { PatternDiscovery } from './PatternDiscovery';

const data = (extra: Partial<InsightsData>): InsightsData => ({
  window_days: 90,
  days_analyzed: 0,
  min_days: 7,
  insights: [],
  ...extra,
});

describe('PatternDiscovery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tells a new user how many days are left before patterns appear', async () => {
    vi.spyOn(profileApi, 'getInsights').mockResolvedValue(data({ days_analyzed: 5 }));
    render(<PatternDiscovery />);
    expect(await screen.findByTestId('pattern-waiting')).toHaveTextContent("You're 2 days away");
  });

  it('says so plainly when the data shows no clear pattern', async () => {
    vi.spyOn(profileApi, 'getInsights').mockResolvedValue(data({ days_analyzed: 20 }));
    render(<PatternDiscovery />);
    expect(await screen.findByTestId('pattern-none')).toBeInTheDocument();
  });

  it('lists each insight with its evidence', async () => {
    vi.spyOn(profileApi, 'getInsights').mockResolvedValue(
      data({
        days_analyzed: 29,
        insights: [
          {
            id: 'weekday-peak',
            kind: 'weekday_peak',
            headline: 'Your physical exhaustion tends to peak on Thursdays',
            detail: 'Thursdays averaged 89 against 46 on other days.',
            sample_size: 4,
          },
        ],
      }),
    );
    render(<PatternDiscovery />);
    const row = await screen.findByTestId('insight-weekday-peak');
    expect(row).toHaveTextContent('peak on Thursdays');
    expect(row).toHaveTextContent('89 against 46');
    expect(screen.getByText(/Found in your last 29 check-ins/)).toBeInTheDocument();
  });
});
