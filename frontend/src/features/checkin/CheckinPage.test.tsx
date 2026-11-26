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

    fireEvent.click(await screen.findByTestId('checkin-start'));
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

    fireEvent.click(await screen.findByTestId('checkin-start'));
    const label = screen.getByTestId(`answer-${CHECKIN_QUESTIONS[0].key}-2`);
    fireEvent.pointerDown(label);
    fireEvent.click(label);

    expect(screen.getByTestId('checkin-sympathy')).toBeInTheDocument();
  });
});
