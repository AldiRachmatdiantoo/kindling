import { PhoneCall, ShieldAlert } from 'lucide-react';

export function SafetyBanner() {
  return (
    <section
      className="rounded-3xl border-2 border-peach-strong bg-peach p-5 text-ink"
      data-testid="safety-banner"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-ink bg-surface text-peach-strong">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-ink">
            You don't have to go through this alone
          </h2>
          <p className="text-sm leading-relaxed text-ink">
            If things feel really heavy right now, or you're having thoughts of hurting yourself,
            please reach out to a professional or an emergency support line. Kindling can't replace
            medical care or crisis counseling.
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-sm font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-surface px-3 py-1.5 font-semibold text-ink">
              <PhoneCall className="h-4 w-4" aria-hidden="true" />
              SEJIWA hotline: 119 ext. 8
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-surface px-3 py-1.5 font-semibold text-ink">
              <PhoneCall className="h-4 w-4" aria-hidden="true" />
              Indonesia emergency: 112
            </span>
          </div>
          <p className="text-xs text-ink-soft">
            You can also talk to a psychologist, a psychiatrist, a campus or workplace counselor, or
            someone close to you that you trust.
          </p>
        </div>
      </div>
    </section>
  );
}
