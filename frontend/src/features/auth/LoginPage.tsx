import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { Mascot } from '../../components/Mascot';
import { ThemeToggle } from '../theme/ThemeToggle';
import { loginSchema } from '../../api/schemas';
import { useAuth } from './AuthContext';
import { Button } from '@/components/watermelon-ui/button';

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const data = await authApi.login(parsed.data);
      setUser(data.user);
      navigate(fromPath, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("We couldn't reach the server. Give it a moment and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <div className="k-wave k-on-primary relative bg-primary px-4 pt-10 pb-24 text-center">
        <ThemeToggle className="absolute top-4 right-4" />
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex justify-center">
            <Mascot mood="happy" className="k-pop h-24 w-20" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Welcome back</h1>
          <p className="mt-2 text-sm text-white">
            Start today with the energy you actually have, not yesterday's to-do list.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="k-card k-enter relative z-10 mx-auto -mt-16 w-[calc(100%-2rem)] max-w-md space-y-4 p-6 sm:p-7"
        data-testid="login-form"
        noValidate
      >
        {formError && (
          <div className="k-error" data-testid="login-error" role="alert">
            {formError}
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="k-label">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="login-email"
            placeholder="you@example.com"
            className="k-input"
          />
          {fieldErrors.email && (
            <p className="mt-1 text-xs font-medium text-peach-strong">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="login-password" className="k-label">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="login-password"
            placeholder="••••••••••"
            className="k-input"
          />
          {fieldErrors.password && (
            <p className="mt-1 text-xs font-medium text-peach-strong">{fieldErrors.password}</p>
          )}
        </div>

        <Button type="submit" disabled={submitting} data-testid="login-submit" className="w-full">
          {submitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="mx-auto mt-6 max-w-md px-4 pb-12 text-center text-sm text-ink-soft">
        New here?{' '}
        <Link
          to="/register"
          className="font-bold text-primary underline-offset-4 hover:text-primary-dark hover:underline"
          data-testid="go-to-register"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
