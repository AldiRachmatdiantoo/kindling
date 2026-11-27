import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { authApi, checkinApi } from '../../api/endpoints';
import { AuthProvider } from '../auth/AuthContext';
import { TodayStatusProvider } from '../today/TodayStatus';
import { CheckinPage } from './CheckinPage';
import { CHECKIN_QUESTIONS } from './constants';

const mockUser = {
  id: 'user-1',
  email: 'test@kindling.test',
  full_name: 'Aldi Test',
  timezone: 'Asia/Jakarta',
  ai_consent_given: true,
};

function renderCheckin() {
  vi.spyOn(authApi, 'me').mockResolvedValue({ user: mockUser });
  vi.spyOn(checkinApi, 'getToday').mockRejectedValue(
    new ApiError(404, 'NOT_FOUND', 'No check-in today'),
  );
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TodayStatusProvider>
          <CheckinPage />
        </TodayStatusProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('CheckinPage keyboard navigation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lets keyboard users navigate all Likert radio options without modal interception until Next', async () => {
    renderCheckin();

    fireEvent.click(await screen.findByTestId('checkin-guide-skip'));
    expect(screen.getByTestId('checkin-step-label')).toHaveTextContent('1 of 9');

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);

    // Simulate keyboard navigation across options 1 -> 2 -> 3 -> 4
    for (const radio of radios) {
      fireEvent.keyDown(radio, { key: 'ArrowDown' });
      fireEvent.click(radio);
    }

    // Sympathy modal must NOT intercept keyboard selection
    expect(screen.queryByTestId('checkin-sympathy')).not.toBeInTheDocument();
    expect(radios[3]).toBeChecked();

    // Confirming with Next opens the sympathy dialog, then advancing moves to 2 of 9
    fireEvent.click(screen.getByTestId('checkin-next'));
    expect(screen.getByTestId('checkin-sympathy')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sympathy-next'));
    expect(screen.getByTestId('checkin-step-label')).toHaveTextContent('2 of 9');
  });

  it('opens the sympathy dialog immediately on pointer click of an option', async () => {
    renderCheckin();

    fireEvent.click(await screen.findByTestId('checkin-guide-skip'));
    const label = screen.getByTestId(`answer-${CHECKIN_QUESTIONS[0].key}-2`);
    fireEvent.pointerDown(label);
    fireEvent.click(label);

    expect(screen.getByTestId('checkin-sympathy')).toBeInTheDocument();
  });

  it('shares an early read after each pillar, then concludes the day before the last step', async () => {
    renderCheckin();
    fireEvent.click(await screen.findByTestId('checkin-guide-skip'));

    const answerAndAdvance = (value: number) => {
      fireEvent.click(screen.getAllByRole('radio')[value - 1]);
      fireEvent.click(screen.getByTestId('checkin-next'));
      fireEvent.click(screen.getByTestId('sympathy-next'));
    };
    const continueRead = async (pillar: string) => {
      expect(screen.getByTestId(`checkin-reading-${pillar}`)).toBeInTheDocument();
      fireEvent.click(await screen.findByTestId('reading-continue', {}, { timeout: 3000 }));
    };

    // Physical: 3 questions, all "Very much" tired
    for (let i = 0; i < 3; i++) answerAndAdvance(4);
    await continueRead('physical');
    expect(screen.getByTestId('checkin-step-label')).toHaveTextContent('4 of 9');

    // Work: 4 questions
    for (let i = 0; i < 4; i++) answerAndAdvance(2);
    await continueRead('work');

    // Soul: 2 questions, then the conclusion
    for (let i = 0; i < 2; i++) answerAndAdvance(3);
    await continueRead('soul');
    expect(screen.getByTestId('checkin-conclusion')).toBeInTheDocument();
    // Physical exhaustion at 100 makes it a gentle day, same rule as the server
    expect(await screen.findByTestId('conclusion-tier', {}, { timeout: 3000 })).toHaveTextContent(
      'Gentle Mode',
    );
    fireEvent.click(screen.getByTestId('conclusion-continue'));
    expect(screen.getByTestId('checkin-step-label')).toHaveTextContent('Last step');
  }, 15000);
});
