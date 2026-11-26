import { Award, CalendarHeart, Flame, HeartHandshake, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { profileApi } from '../../api/endpoints';
import type { HeatmapData } from '../../api/types';
import { HeatmapGrid } from '../../components/HeatmapGrid';
import { useAuth } from '../auth/AuthContext';

export function ProfilePage() {
  const { user } = useAuth();
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    profileApi
      .getHeatmap()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : 'Gagal memuat data heatmap.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" data-testid="profile-loading">
        <div className="k-spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="k-error p-6" data-testid="profile-error">
        {error || 'Data profil tidak tersedia.'}
      </div>
    );
  }

  const statCards = [
    {
      key: 'total_active_days',
      label: 'Total Hari Aktif',
      value: data.milestones.total_active_days,
      icon: Flame,
      bg: 'bg-white',
    },
    {
      key: 'total_complete_days',
      label: 'Hari 3/3 Wins',
      value: data.milestones.total_complete_days,
      icon: Award,
      bg: 'bg-lavender',
    },
    {
      key: 'total_recovery_days',
      label: 'Hari Pemulihan',
      value: data.milestones.total_recovery_days,
      icon: HeartHandshake,
      bg: 'bg-sky',
    },
    {
      key: 'total_daily_wins',
      label: 'Total Daily Wins',
      value: data.milestones.total_daily_wins,
      icon: Sparkles,
      bg: 'bg-mint',
    },
  ];

  const initials =
    (user?.full_name || 'Kindling')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'K';

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-lime font-serif text-xl font-bold text-ink"
            aria-hidden="true"
          >
            {initials}
          </span>
          <div>
            <p className="text-xs font-semibold text-ink-faint">Profil &amp; Jejak Pemulihan</p>
            <h1 className="text-3xl font-bold tracking-tight text-ink">
              {user?.full_name || 'Pengguna Kindling'}
            </h1>
            <p className="text-sm text-ink-soft">
              {user?.email} · {user?.timezone || 'Asia/Jakarta'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-2xl border-[1.5px] border-ink bg-mint px-4 py-2.5 text-xs leading-relaxed font-medium text-ink">
          <CalendarHeart className="mt-0.5 h-4 w-4 shrink-0 text-mint-strong" />
          Tanpa reset streak — istirahat adalah bagian dari proses.
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ key, label, value, icon: Icon, bg }) => (
          <div
            key={key}
            className={`rounded-3xl border-[1.5px] border-ink p-5 ${bg}`}
            data-testid={`stat-${key}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink-soft">{label}</span>
              <Icon className="h-4 w-4 shrink-0 text-ink" />
            </div>
            <p className="mt-2 font-serif text-4xl font-bold tracking-tight text-ink">{value}</p>
            <p className="mt-1 text-[11px] text-ink-faint">Akumulasi seumur hidup</p>
          </div>
        ))}
      </section>

      <section className="k-card space-y-4 p-6">
        <div>
          <h2 className="text-2xl font-bold text-ink">Jejak 365 Hari</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Rentang {data.range.from} hingga {data.range.to}. Kotak kosong menandakan hari
            istirahat, bukan kegagalan.
          </p>
        </div>

        <HeatmapGrid from={data.range.from} to={data.range.to} days={data.days} />
      </section>
    </div>
  );
}
