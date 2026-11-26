import { Flame } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { loginSchema } from '../../api/schemas';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/checkin';

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
        setFormError('Tidak dapat terhubung ke server. Coba lagi sebentar.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Flame className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Masuk ke Kindling</h1>
          <p className="mt-1 text-sm text-stone-500">
            Small sparks, steady fire. Mulai hari sesuai kapasitas energimu.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs"
          data-testid="login-form"
          noValidate
        >
          {formError && (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
              data-testid="login-error"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-stone-700">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email"
              placeholder="kamu@contoh.com"
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-sm font-medium text-stone-700"
            >
              Kata Sandi
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password"
              placeholder="••••••••••"
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            data-testid="login-submit"
            className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <p className="text-center text-sm text-stone-600">
          Belum punya akun?{' '}
          <Link
            to="/register"
            className="font-semibold text-amber-700 hover:text-amber-800 hover:underline"
            data-testid="go-to-register"
          >
            Daftar sekarang
          </Link>
        </p>
      </div>
    </div>
  );
}
