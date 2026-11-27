import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { Mascot } from '../../components/Mascot';
import { ThemeToggle } from '../theme/ThemeToggle';
import { loginSchema } from '../../api/schemas';
import { useAuth } from './AuthContext';
import { Button } from '@/components/watermelon-ui/button';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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
      // Signing in opens on the welcome screen, unless the user was sent here from a page.
      navigate(fromPath === '/' ? '/welcome' : fromPath, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details && typeof err.details === 'object') {
          const backendErrors: Record<string, string> = {};
          for (const [key, value] of Object.entries(err.details)) {
            if (typeof value === 'string' && value.trim()) {
              backendErrors[key] = value;
            }
          }
          if (Object.keys(backendErrors).length > 0) {
            setFieldErrors(backendErrors);
          }
        }
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
      <div className="relative px-4 pt-10 pb-20 text-center">
        <ThemeToggle className="absolute top-4 right-4" />
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex justify-center">
            <Mascot mood="happy" className="k-pop h-24 w-20" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Welcome back</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Start today with the energy you actually have, not yesterday's to-do list.
          </p>
        </div>
      </div>

      <Card
        asChild
        className="k-enter relative z-10 mx-auto -mt-16 w-[calc(100%-2rem)] max-w-md space-y-4 p-6 sm:p-7"
      >
        <form
          onSubmit={handleSubmit}

          data-testid="login-form"
          noValidate
        >
          {formError && (
            <div className="k-error" data-testid="login-error" role="alert">
              {formError}
            </div>
          )}

          <div>
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email"
              placeholder="you@example.com"
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="login-email-error" className="mt-1 text-xs font-medium text-peach-strong">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password"
              placeholder="••••••••••"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
            />
            {fieldErrors.password && (
              <p id="login-password-error" className="mt-1 text-xs font-medium text-peach-strong">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <Button type="submit" disabled={submitting} data-testid="login-submit" className="w-full">
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </Card>

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
