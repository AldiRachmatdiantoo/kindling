import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../../api/endpoints';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../../api/endpoints', () => ({
  authApi: {
    me: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockedAuthApi = vi.mocked(authApi);

function LogoutHarness() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="user-id">{user?.id ?? 'none'}</span>
      <button type="button" onClick={() => void logout()}>
        Sign out
      </button>
    </div>
  );
}

describe('AuthContext logout resilience', () => {
  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('clears user state and user-scoped timers even when authApi.logout rejects', async () => {
    mockedAuthApi.me.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'a@example.com',
        full_name: 'Alex',
        timezone: 'Asia/Jakarta',
      },
    });
    mockedAuthApi.logout.mockRejectedValue(new Error('offline'));

    sessionStorage.setItem('kindling:timer:user-1:2026-11-26:win:physical', '{"running":true}');
    sessionStorage.setItem('kindling:timer:user-1:2026-11-26:cope:c1:box', '{"running":true}');
    sessionStorage.setItem('kindling:timer:user-2:2026-11-26:win:physical', '{"running":true}');

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LogoutHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('user-1');
    });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('none');
    });

    expect(sessionStorage.getItem('kindling:timer:user-1:2026-11-26:win:physical')).toBeNull();
    expect(sessionStorage.getItem('kindling:timer:user-1:2026-11-26:cope:c1:box')).toBeNull();
    expect(sessionStorage.getItem('kindling:timer:user-2:2026-11-26:win:physical')).toBe(
      '{"running":true}',
    );
  });
});
