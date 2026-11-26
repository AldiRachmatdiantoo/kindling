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
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800"
        data-testid="profile-error"
      >
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
      color: 'text-amber-700 bg-amber-50',
    },
    {
      key: 'total_complete_days',
      label: 'Hari 3/3 Wins',
      value: data.milestones.total_complete_days,
      icon: Award,
      color: 'text-emerald-700 bg-emerald-50',
    },
    {
      key: 'total_recovery_days',
      label: 'Hari Pemulihan',
      value: data.milestones.total_recovery_days,
      icon: HeartHandshake,
      color: 'text-sky-700 bg-sky-50',
    },
    {
      key: 'total_daily_wins',
      label: 'Total Daily Wins',
      value: data.milestones.total_daily_wins,
      icon: Sparkles,
      color: 'text-violet-700 bg-violet-50',
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
              Profil &amp; Jejak Pemulihan
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">
              {user?.full_name || 'Pengguna Kindling'}
            </h1>
            <p className="text-sm text-stone-500">
              {user?.email} · Zona waktu: {user?.timezone || 'Asia/Jakarta'}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs text-stone-600">
            <CalendarHeart className="h-4 w-4 text-amber-600" />
            Tanpa reset streak — istirahat adalah bagian dari proses.
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ key, label, value, icon: Icon, color }) => (
          <div
            key={key}
            className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs"
            data-testid={`stat-${key}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500">{label}</span>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-stone-900">{value}</p>
            <p className="mt-1 text-[11px] text-stone-400">Akumulasi seumur hidup</p>
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              Anti-Burnout Heatmap (365 Hari)
            </h2>
            <p className="text-xs text-stone-500">
              Rentang {data.range.from} hingga {data.range.to}. Kotak abu-abu menandakan hari
              istirahat, bukan kegagalan.
            </p>
          </div>
        </div>

        <HeatmapGrid from={data.range.from} to={data.range.to} days={data.days} />
      </section>
    </div>
  );
}
