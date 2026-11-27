import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { Mascot } from '../../components/Mascot';
import { ThemeToggle } from '../theme/ThemeToggle';
import { registerSchema } from '../../api/schemas';
import { useAuth } from './AuthContext';
import { Button } from '@/components/watermelon-ui/button';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { markJustRegistered } from '../../utils/justRegistered';

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
  } catch {
    return 'Asia/Jakarta';
  }
}

export function RegisterPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [timezone, setTimezone] = useState(detectTimezone);
  const [aiConsent, setAiConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = registerSchema.safeParse({
      full_name: fullName,
      email,
      password,
      timezone: timezone.trim() || 'Asia/Jakarta',
      ai_consent: aiConsent,
    });

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
      const data = await authApi.register(parsed.data);
      // A brand-new account meets Ember first, then goes on to the check-in from there.
      markJustRegistered();
      setUser(data.user);
      navigate('/welcome', { replace: true, state: { isNew: true } });
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
        setFormError("We couldn't create your account just now. Please try again in a moment.");
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
          <h1 className="text-3xl font-bold tracking-tight text-ink">Join Kindling</h1>
          <p className="mt-2 text-sm text-ink-soft">
            No streak pressure. Just small, realistic steps for today.
          </p>
        </div>
      </div>

      <Card
        asChild
        className="k-enter relative z-10 mx-auto -mt-16 w-[calc(100%-2rem)] max-w-md space-y-4 p-6 sm:p-7"
      >
        <form
          onSubmit={handleSubmit}

          data-testid="register-form"
          noValidate
        >
          {formError && (
            <div className="k-error" data-testid="register-error" role="alert">
              {formError}
            </div>
          )}

          <div>
            <Label htmlFor="register-name">Your name</Label>
            <Input
              id="register-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              data-testid="register-fullname"
              placeholder="Alex Morgan"
              aria-invalid={fieldErrors.full_name ? true : undefined}
              aria-describedby={fieldErrors.full_name ? 'register-name-error' : undefined}
            />
            {fieldErrors.full_name && (
              <p id="register-name-error" className="mt-1 text-xs font-medium text-peach-strong">
                {fieldErrors.full_name}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="register-email"
              placeholder="you@example.com"
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="register-email-error" className="mt-1 text-xs font-medium text-peach-strong">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="register-password">
              Password <span className="font-normal text-ink-faint">(at least 10 characters)</span>
            </Label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="register-password"
              placeholder="At least 10 characters"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
            />
            {fieldErrors.password && (
              <p
                id="register-password-error"
                className="mt-1 text-xs font-medium text-peach-strong"
              >
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="register-timezone">Time zone</Label>
            <Input
              id="register-timezone"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              data-testid="register-timezone"
              placeholder="Asia/Jakarta"
              aria-invalid={fieldErrors.timezone ? true : undefined}
              aria-describedby={fieldErrors.timezone ? 'register-timezone-error' : undefined}
            />
            {fieldErrors.timezone && (
              <p
                id="register-timezone-error"
                data-testid="register-timezone-error"
                className="mt-1 text-xs font-medium text-peach-strong"
              >
                {fieldErrors.timezone}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface-2 p-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ink">
              <input
                type="checkbox"
                checked={aiConsent}
                onChange={(e) => setAiConsent(e.target.checked)}
                data-testid="register-ai-consent"
                aria-invalid={fieldErrors.ai_consent ? true : undefined}
                aria-describedby={fieldErrors.ai_consent ? 'register-consent-error' : undefined}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span>
                I agree that my check-in text (the <em>brain dump</em>, my <em>fun thing</em>, and
                daily tasks) can be processed by an AI service to suggest recovery moments and small
                daily steps. Personal details like my name and email are never sent to the AI.
              </span>
            </label>
            {fieldErrors.ai_consent && (
              <p
                id="register-consent-error"
                className="mt-1.5 text-xs font-medium text-peach-strong"
                data-testid="register-consent-error"
              >
                {fieldErrors.ai_consent}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={submitting}
            data-testid="register-submit"
            className="w-full"
          >
            {submitting ? 'Creating your account...' : 'Create account'}
          </Button>
        </form>
      </Card>

      <p className="mx-auto mt-6 max-w-md px-4 pb-12 text-center text-sm text-ink-soft">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-bold text-primary underline-offset-4 hover:text-primary-dark hover:underline"
          data-testid="go-to-login"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
