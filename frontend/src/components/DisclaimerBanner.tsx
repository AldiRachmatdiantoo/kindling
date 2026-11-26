import { Info } from 'lucide-react';

export function DisclaimerBanner() {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border-[1.5px] border-dashed border-ink/40 bg-surface/60 px-4 py-3 text-xs leading-relaxed text-ink-soft"
      data-testid="disclaimer-banner"
      role="note"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
      <p>
        <strong>Good to know:</strong> the 9 check-in questions are a short adaptation of the CBI,
        OLBI, and WHO-5 on a 1 to 4 scale. They are <strong>not</strong> a validated clinical tool,
        not a medical or psychological diagnosis, and not a replacement for a professional. Your
        scores are only used to tune your daily suggestions.
      </p>
    </div>
  );
}
