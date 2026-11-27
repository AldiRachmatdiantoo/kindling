import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { authApi, checkinApi, habitsApi } from '../../api/endpoints';
import { AuthProvider } from '../auth/AuthContext';
import { TodayStatusProvider } from '../today/TodayStatus';
import { AUTO_ADVANCE_MS, CheckinPage } from './CheckinPage';
import { FUN_PICKS } from './constants';

const mockUser = {
  id: 'user-1',
  email: 'test@kindling.test',
  full_name: 'Aldi Test',
  timezone: 'Asia/Jakarta',
  ai_consent_given: true,
};

function renderCheckin() {
  vi.spyOn(authApi, 'me').mockResolvedValue({ user: mockUser });
  vi.spyOn(habitsApi, 'get').mockResolvedValue({ physical: null, work: null, soul: null });
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

const stepLabel = () => screen.getByTestId('checkin-step-label');
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A real tap: pointerdown then click, like a mouse or finger. */
function tapAnswer(value: number) {
  const key = screen.getAllByRole('radio')[0].getAttribute('name');
  const label = screen.getByTestId(`answer-${key}-${value}`);
  fireEvent.pointerDown(label);
  fireEvent.click(label);
}

async function start() {
  renderCheckin();
  fireEvent.click(await screen.findByTestId('checkin-guide-skip'));
  expect(stepLabel()).toHaveTextContent('1 of 9');
}

describe('CheckinPage auto-advance', () => {
  afterEach(() => vi.restoreAllMocks());

  it('moves on by itself shortly after a tap, with the choice shown first', async () => {
    await start();
    expect(screen.queryByTestId('checkin-next')).not.toBeInTheDocument();

    tapAnswer(2);
    // Still on the question for a beat, with the chosen answer highlighted.
    expect(stepLabel()).toHaveTextContent('1 of 9');
    expect(screen.getAllByRole('radio')[1]).toBeChecked();
    expect(screen.queryByTestId('checkin-next')).not.toBeInTheDocument();

    await waitFor(() => expect(stepLabel()).toHaveTextContent('2 of 9'));
    // The new, unanswered question has no Next button, and focus followed the user.
    expect(screen.queryByTestId('checkin-next')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[0]);
  });

  it('lets arrow keys browse the options without moving on', async () => {
    await start();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);

    // Browsers fire click on a radio reached with the arrow keys; that must not advance.
    for (const radio of radios) {
      fireEvent.keyDown(radio, { key: 'ArrowDown' });
      fireEvent.click(radio);
    }
    await wait(AUTO_ADVANCE_MS + 150);
    expect(stepLabel()).toHaveTextContent('1 of 9');
    expect(radios[3]).toBeChecked();

    // Enter confirms the highlighted option and moves on.
    fireEvent.keyDown(radios[3], { key: 'Enter' });
    await waitFor(() => expect(stepLabel()).toHaveTextContent('2 of 9'));
  });

  it('moves on with Space too', async () => {
    await start();
    fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: ' ' });
    await waitFor(() => expect(stepLabel()).toHaveTextContent('2 of 9'));
  });

  it('skips only one question on a quick double tap', async () => {
    await start();
    tapAnswer(3);
    tapAnswer(3);
    await waitFor(() => expect(stepLabel()).toHaveTextContent('2 of 9'));
    await wait(AUTO_ADVANCE_MS + 150);
    expect(stepLabel()).toHaveTextContent('2 of 9');
  });

  it('keeps Back, and shows Next again on an answered question', async () => {
    await start();
    tapAnswer(1);
    await waitFor(() => expect(stepLabel()).toHaveTextContent('2 of 9'));

    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(stepLabel()).toHaveTextContent('1 of 9');
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    fireEvent.click(screen.getByTestId('checkin-next'));
    expect(stepLabel()).toHaveTextContent('2 of 9');
  });

  it('still auto-advances when the user prefers reduced motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      })),
    );
    try {
      await start();
      tapAnswer(4);
      await waitFor(() => expect(stepLabel()).toHaveTextContent('2 of 9'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shares an early read after each pillar, then concludes the day before the last step', async () => {
    await start();

    const answer = async (value: number, expected: string) => {
      tapAnswer(value);
      await waitFor(() => expect(stepLabel()).toHaveTextContent(expected));
    };
    const continueRead = async (pillar: string) => {
      fireEvent.click(await screen.findByTestId('reading-continue', {}, { timeout: 3000 }));
      expect(screen.queryByTestId(`checkin-reading-${pillar}`)).not.toBeInTheDocument();
    };

    // Physical: 3 questions, all "Very much" tired
    await answer(4, '2 of 9');
    await answer(4, '3 of 9');
    await answer(4, 'Physical read');
    expect(screen.getByTestId('checkin-reading-physical')).toBeInTheDocument();
    await continueRead('physical');
    expect(stepLabel()).toHaveTextContent('4 of 9');

    // Work: 4 questions
    for (const next of ['5 of 9', '6 of 9', '7 of 9', 'Work read']) await answer(2, next);
    await continueRead('work');

    // Soul: 2 questions, then the conclusion
    await answer(3, '9 of 9');
    await answer(3, 'Soul read');
    await continueRead('soul');
    expect(screen.getByTestId('checkin-conclusion')).toBeInTheDocument();
    // Physical exhaustion at 100 makes it a gentle day, same rule as the server
    expect(await screen.findByTestId('conclusion-tier', {}, { timeout: 3000 })).toHaveTextContent(
      'Gentle Mode',
    );
    fireEvent.click(screen.getByTestId('conclusion-continue'));
    // Then the habits the wins are built from; with none set yet, the form can be skipped
    expect(stepLabel()).toHaveTextContent('Your habits');
    fireEvent.click(await screen.findByTestId('habits-skip'));
    expect(stepLabel()).toHaveTextContent('Last step');
  }, 20000);
});

describe('CheckinPage fun thing quick picks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fills the fun thing from a chip and keeps it editable', async () => {
    renderCheckin();
    fireEvent.click(await screen.findByTestId('preset-a-button'));
    const input = screen.getByTestId('checkin-fun-cope');

    const chips = screen.getAllByRole('button', { name: /^Use "/ });
    expect(chips).toHaveLength(FUN_PICKS.length);
    expect(screen.getByRole('group', { name: 'Quick picks for your fun thing' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: `Use "${FUN_PICKS[1]}"` }));
    expect(input).toHaveValue(FUN_PICKS[1]);
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.change(input, { target: { value: `${FUN_PICKS[1]} on the couch` } });
    expect(input).toHaveValue(`${FUN_PICKS[1]} on the couch`);
    // A chip is not a submit button: tapping it never sends the check-in.
    expect(chips.every((chip) => chip.getAttribute('type') === 'button')).toBe(true);
  });
});
