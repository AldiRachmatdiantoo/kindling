import { Flame } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { registerSchema } from '../../api/schemas';
import { useAuth } from './AuthContext';

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
      setUser(data.user);
      navigate('/checkin', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Gagal mendaftar. Coba lagi sebentar.');
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
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Buat Akun Kindling</h1>
          <p className="mt-1 text-sm text-stone-500">
            Tanpa tekanan streak. Cukup langkah kecil yang realistis hari ini.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs"
          data-testid="register-form"
          noValidate
        >
          {formError && (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
              data-testid="register-error"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div>
            <label
              htmlFor="register-name"
              className="mb-1.5 block text-sm font-medium text-stone-700"
            >
              Nama Lengkap
            </label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              data-testid="register-fullname"
              placeholder="Alice Kindling"
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            {fieldErrors.full_name && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.full_name}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="register-email"
              className="mb-1.5 block text-sm font-medium text-stone-700"
            >
              Email
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="register-email"
              placeholder="kamu@contoh.com"
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="mb-1.5 block text-sm font-medium text-stone-700"
            >
              Kata Sandi <span className="font-normal text-stone-400">(minimal 10 karakter)</span>
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="register-password"
              placeholder="Minimal 10 karakter"
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="register-timezone"
              className="mb-1.5 block text-sm font-medium text-stone-700"
            >
              Zona Waktu
            </label>
            <input
              id="register-timezone"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              data-testid="register-timezone"
              placeholder="Asia/Jakarta"
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-stone-700">
              <input
                type="checkbox"
                checked={aiConsent}
                onChange={(e) => setAiConsent(e.target.checked)}
                data-testid="register-ai-consent"
                className="mt-0.5 h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
              />
              <span>
                Saya menyetujui bahwa teks check-in (<em>brain dump</em>, <em>fun thing</em>, dan
                tugas harian) dapat diproses oleh layanan AI untuk menyusun saran pemulihan dan
                langkah mikro harian. Identitas pribadi seperti email dan nama tidak dikirim ke AI.
              </span>
            </label>
            {fieldErrors.ai_consent && (
              <p className="mt-1.5 text-xs text-rose-600" data-testid="register-consent-error">
                {fieldErrors.ai_consent}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            data-testid="register-submit"
            className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Mendaftarkan...' : 'Daftar'}
          </button>
        </form>

        <p className="text-center text-sm text-stone-600">
          Sudah punya akun?{' '}
          <Link
            to="/login"
            className="font-semibold text-amber-700 hover:text-amber-800 hover:underline"
            data-testid="go-to-login"
          >
            Masuk di sini
          </Link>
        </p>
      </div>
    </div>
  );
}
