import { Info } from 'lucide-react';

export function DisclaimerBanner() {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border-[1.5px] border-dashed border-ink/40 bg-white/60 px-4 py-3 text-xs leading-relaxed text-ink-soft"
      data-testid="disclaimer-banner"
      role="note"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
      <p>
        <strong>Catatan Penting:</strong> 9 butir check-in Kindling adalah adaptasi singkat dari
        CBI, OLBI, dan WHO-5 dengan skala 1–4. Ini <strong>bukan</strong> instrumen klinis
        tervalidasi, bukan alat diagnosis medis/psikologis, dan bukan pengganti tenaga profesional.
        Skor hanya digunakan untuk mengkalibrasi saran harianmu.
      </p>
    </div>
  );
}
