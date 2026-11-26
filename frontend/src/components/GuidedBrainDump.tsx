import { Eraser, PenLine } from 'lucide-react';
import { useState } from 'react';
import { CountdownTimer } from './CountdownTimer';

export interface GuidedBrainDumpProps {
  durationSeconds: number;
  guidance?: string;
}

export function GuidedBrainDump({ durationSeconds, guidance }: GuidedBrainDumpProps) {
  const [draft, setDraft] = useState('');
  const [clearedNotice, setClearedNotice] = useState(false);

  const handleRelease = () => {
    setDraft('');
    setClearedNotice(true);
  };

  return (
    <div
      className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-5"
      data-testid="guided-brain-dump"
    >
      <div className="flex items-center gap-2 text-amber-950">
        <PenLine className="h-5 w-5 text-amber-700" />
        <h3 className="text-base font-semibold">Guided Brain-Dump</h3>
      </div>

      {guidance && <p className="text-xs leading-relaxed text-stone-600">{guidance}</p>}

      <CountdownTimer
        durationSeconds={durationSeconds}
        subtitle="Tulis tanpa menyunting. Tulisan di kotak ini tidak disimpan ke server."
        testIdPrefix="brain-dump-timer"
      />

      <div>
        <textarea
          rows={5}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (clearedNotice) setClearedNotice(false);
          }}
          data-testid="guided-brain-dump-input"
          placeholder="Tulis semua yang ada di kepalamu sekarang, tanpa perlu rapi..."
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-stone-500">
            {clearedNotice
              ? 'Catatan sudah dilepaskan dari layar.'
              : 'Hanya ada di layarmu — tekan Lepaskan kapan pun selesai.'}
          </span>
          <button
            type="button"
            onClick={handleRelease}
            data-testid="guided-brain-dump-clear"
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
          >
            <Eraser className="h-3.5 w-3.5" />
            Lepaskan &amp; Bersihkan
          </button>
        </div>
      </div>
    </div>
  );
}
