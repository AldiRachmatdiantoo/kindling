import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { AuthProvider } from './AuthContext';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { ProtectedRoute } from './RouteGuards';

vi.mock('../../api/endpoints', () => ({
  authApi: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockedAuthApi = vi.mocked(authApi);

describe('Auth forms a11y, backend validation details, and RouteGuards copy', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets aria-invalid and aria-describedby on invalid LoginPage fields', async () => {
    mockedAuthApi.me.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Unauthorized'));
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('login-submit'));

    const emailInput = screen.getByTestId('login-email');
    const passwordInput = screen.getByTestId('login-password');
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', 'login-email-error');
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput).toHaveAttribute('aria-describedby', 'login-password-error');
  });

  it('renders backend err.details.timezone under the timezone input with aria attributes', async () => {
    mockedAuthApi.me.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Unauthorized'));
    mockedAuthApi.register.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Invalid registration input', {
        timezone: 'must be a valid IANA timezone',
      }),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByTestId('register-fullname'), 'Alex Morgan');
    await user.type(screen.getByTestId('register-email'), 'alex@example.com');
    await user.type(screen.getByTestId('register-password'), 'supersecret123');
    const tzInput = screen.getByTestId('register-timezone');
    await user.clear(tzInput);
    await user.type(tzInput, 'Not/A_Zone');
    await user.click(screen.getByTestId('register-ai-consent'));
    await user.click(screen.getByTestId('register-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('register-timezone-error')).toHaveTextContent(
        'must be a valid IANA timezone',
      );
    });
    expect(tzInput).toHaveAttribute('aria-invalid', 'true');
    expect(tzInput).toHaveAttribute('aria-describedby', 'register-timezone-error');
  });

  it('uses neutral copy in SessionUnreachable without claiming the user is still signed in', async () => {
    mockedAuthApi.me.mockRejectedValue(new Error('network error'));

    render(
      <MemoryRouter initialEntries={['/wins']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/wins" element={<div>Wins</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    const alert = await screen.findByTestId('session-unreachable');
    expect(alert).not.toHaveTextContent("You're still signed in.");
    expect(alert).toHaveTextContent("We couldn't check your session just now.");
  });
});
