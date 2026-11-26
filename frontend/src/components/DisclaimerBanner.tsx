import { Info } from 'lucide-react';

export function DisclaimerBanner() {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-100/80 px-4 py-3 text-xs leading-relaxed text-stone-600"
      data-testid="disclaimer-banner"
      role="note"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
      <p>
        <strong>Catatan Penting:</strong> 9 butir check-in Kindling adalah adaptasi singkat dari
        CBI, OLBI, dan WHO-5 dengan skala 1–4. Ini <strong>bukan</strong> instrumen klinis
        tervalidasi, bukan alat diagnosis medis/psikologis, dan bukan pengganti tenaga profesional.
        Skor hanya digunakan untuk mengkalibrasi saran harianmu.
      </p>
    </div>
  );
}
