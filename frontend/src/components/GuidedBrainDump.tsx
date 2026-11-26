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
      className="k-card space-y-4 bg-lavender/50 p-5"
      data-testid="guided-brain-dump"
    >
      <div className="flex items-center gap-2 text-ink">
        <PenLine className="h-5 w-5 text-lavender-strong" />
        <h3 className="text-lg font-bold">Guided Brain-Dump</h3>
      </div>

      {guidance && <p className="text-xs leading-relaxed text-ink-soft">{guidance}</p>}

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
          className="k-input"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-ink-soft">
            {clearedNotice
              ? 'Catatan sudah dilepaskan dari layar.'
              : 'Hanya ada di layarmu — tekan Lepaskan kapan pun selesai.'}
          </span>
          <button
            type="button"
            onClick={handleRelease}
            data-testid="guided-brain-dump-clear"
            className="k-btn-secondary shrink-0 px-3 py-1.5 text-xs"
          >
            <Eraser className="h-3.5 w-3.5" />
            Lepaskan &amp; Bersihkan
          </button>
        </div>
      </div>
    </div>
  );
}
