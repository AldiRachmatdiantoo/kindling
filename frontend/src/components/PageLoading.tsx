/**
 * Loading state for a page that fetches on arrival. It holds most of the viewport so the
 * page height doesn't collapse and bounce back, and the spinner only fades in after a short
 * pause, so quick loads show nothing at all instead of a flash.
 */
export function PageLoading({ testId, label }: { testId: string; label?: string }) {
  return (
    <div
      className="k-loading flex min-h-[70vh] items-center justify-center"
      data-testid={testId}
      role="status"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="k-spinner" aria-hidden="true" />
        <p className={label ? 'text-sm text-ink-soft' : 'sr-only'}>{label ?? 'Loading...'}</p>
      </div>
    </div>
  );
}
