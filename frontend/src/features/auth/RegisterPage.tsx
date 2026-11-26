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
    <div className="min-h-screen bg-cream">
      <div className="k-wave bg-primary px-4 pt-10 pb-24 text-center">
        <div className="mx-auto max-w-md">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-ink bg-lime text-ink">
            <Flame className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Buat Akun Kindling</h1>
          <p className="mt-2 text-sm text-white/85">
            Tanpa tekanan streak. Cukup langkah kecil yang realistis hari ini.
          </p>
        </div>

      </div>

        <form
          onSubmit={handleSubmit}
          className="k-card relative z-10 mx-auto -mt-16 w-[calc(100%-2rem)] max-w-md space-y-4 p-6 sm:p-7"
          data-testid="register-form"
          noValidate
        >
          {formError && (
            <div
              className="k-error"
              data-testid="register-error"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div>
            <label
              htmlFor="register-name"
              className="k-label"
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
              className="k-input"
            />
            {fieldErrors.full_name && (
              <p className="mt-1 text-xs font-medium text-peach-strong">{fieldErrors.full_name}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="register-email"
              className="k-label"
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
              className="k-input"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs font-medium text-peach-strong">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="k-label"
            >
              Kata Sandi <span className="font-normal text-ink-faint">(minimal 10 karakter)</span>
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="register-password"
              placeholder="Minimal 10 karakter"
              className="k-input"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs font-medium text-peach-strong">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="register-timezone"
              className="k-label"
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
              className="k-input"
            />
          </div>

          <div className="rounded-2xl border-[1.5px] border-ink bg-lavender p-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ink">
              <input
                type="checkbox"
                checked={aiConsent}
                onChange={(e) => setAiConsent(e.target.checked)}
                data-testid="register-ai-consent"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span>
                Saya menyetujui bahwa teks check-in (<em>brain dump</em>, <em>fun thing</em>, dan
                tugas harian) dapat diproses oleh layanan AI untuk menyusun saran pemulihan dan
                langkah mikro harian. Identitas pribadi seperti email dan nama tidak dikirim ke AI.
              </span>
            </label>
            {fieldErrors.ai_consent && (
              <p className="mt-1.5 text-xs font-medium text-peach-strong" data-testid="register-consent-error">
                {fieldErrors.ai_consent}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            data-testid="register-submit"
            className="k-btn-primary w-full"
          >
            {submitting ? 'Mendaftarkan...' : 'Daftar'}
          </button>
        </form>

        <p className="mx-auto mt-6 max-w-md px-4 pb-12 text-center text-sm text-ink-soft">
          Sudah punya akun?{' '}
          <Link
            to="/login"
            className="font-bold text-primary underline-offset-4 hover:text-primary-dark hover:underline"
            data-testid="go-to-login"
          >
            Masuk di sini
          </Link>
        </p>
    </div>
  );
}
