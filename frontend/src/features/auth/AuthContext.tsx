import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, setUnauthorizedHandler } from '../../api/client';
import { authApi } from '../../api/endpoints';
import type { User } from '../../api/types';
import { clearUserTimers } from '../../components/useClockTimer';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** The session check failed for a reason other than being signed out (server busy, offline). */
  unreachable: boolean;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const data = await authApi.me();
      setUser(data.user);
      setUnreachable(false);
      return data.user;
    } catch (err) {
      // Only a 401 means signed out. A busy or unreachable server must not log anyone out.
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setUnreachable(false);
        return null;
      }
      setUnreachable(true);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    setUnauthorizedHandler(() => {
      if (active) {
        setUser(null);
      }
    });

    refreshUser().finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      setUnauthorizedHandler(null);
    };
  }, [refreshUser]);

  const logout = useCallback(async () => {
    const activeUserId = userIdRef.current;
    try {
      await authApi.logout();
    } catch {
      // Even if the server is unreachable or the session already expired,
      // clear local auth state so the user is still signed out cleanly.
    } finally {
      if (activeUserId) {
        clearUserTimers(activeUserId);
      }
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, unreachable, setUser, refreshUser, logout }),
    [user, loading, unreachable, refreshUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
