import { Eraser, PenLine } from 'lucide-react';
import { useState } from 'react';
import { CountdownTimer } from './CountdownTimer';
import { Button } from '@/components/watermelon-ui/button';

export interface GuidedBrainDumpProps {
  durationSeconds: number;
  guidance?: string;
  /** Keeps the writing timer running across page changes. The text itself is never stored. */
  persistKey?: string;
}

export function GuidedBrainDump({ durationSeconds, guidance, persistKey }: GuidedBrainDumpProps) {
  const [draft, setDraft] = useState('');
  const [clearedNotice, setClearedNotice] = useState(false);

  const handleRelease = () => {
    setDraft('');
    setClearedNotice(true);
  };

  return (
    <div className="k-card space-y-4 bg-lavender/50 p-5" data-testid="guided-brain-dump">
      <div className="flex items-center gap-2 text-ink">
        <PenLine className="h-5 w-5 text-lavender-strong" aria-hidden="true" />
        <h3 className="text-lg font-bold">Guided Brain-Dump</h3>
      </div>

      {guidance && <p className="text-xs leading-relaxed text-ink-soft">{guidance}</p>}

      <CountdownTimer
        durationSeconds={durationSeconds}
        subtitle="Write without editing. Nothing in this box is saved to our servers."
        testIdPrefix="brain-dump-timer"
        persistKey={persistKey}
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
          placeholder="Write down everything on your mind right now. It doesn't have to be neat..."
          className="k-input"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-ink-soft">
            {clearedNotice
              ? 'Gone. Your notes have been cleared from the screen.'
              : "This only lives on your screen. Press Let it go whenever you're done."}
          </span>
          <Button
            onClick={handleRelease}
            data-testid="guided-brain-dump-clear"
            variant="secondary"
            size="sm"
            className="shrink-0"
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
            Let it go
          </Button>
        </div>
      </div>
    </div>
  );
}
