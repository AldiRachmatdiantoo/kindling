import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, setUnauthorizedHandler } from '../../api/client';
import { authApi } from '../../api/endpoints';
import type { User } from '../../api/types';

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
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, unreachable, setUser, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
