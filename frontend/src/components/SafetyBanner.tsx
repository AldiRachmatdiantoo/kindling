import { PhoneCall, ShieldAlert } from 'lucide-react';

export function SafetyBanner() {
  return (
    <section
      className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-rose-950 shadow-xs"
      data-testid="safety-banner"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-rose-900">
            Kamu tidak harus melewati ini sendirian
          </h2>
          <p className="text-sm leading-relaxed text-rose-900/90">
            Jika kamu sedang merasa sangat berat atau memiliki pikiran untuk menyakiti diri sendiri,
            mohon segera hubungi tenaga profesional atau layanan dukungan darurat. Kindling bukan
            pengganti layanan medis atau konseling krisis.
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-sm font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-rose-800 ring-1 ring-rose-200">
              <PhoneCall className="h-4 w-4" />
              Layanan SEJIWA: 119 ext. 8
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-rose-800 ring-1 ring-rose-200">
              <PhoneCall className="h-4 w-4" />
              Darurat Indonesia: 112
            </span>
          </div>
          <p className="text-xs text-rose-700">
            Atau hubungi psikolog, psikiater, konselor kampus/kantor, maupun orang terdekat yang
            kamu percaya.
          </p>
        </div>
      </div>
    </section>
  );
}
