/**
 * A few ready-made answers under a text input, so the user can tap one instead of
 * thinking one up. A pick fills the input and moves focus there, so it can still be edited.
 */
export function QuickPicks({
  options,
  targetId,
  value,
  onPick,
  label,
  disabled = false,
  testIdPrefix,
}: {
  options: readonly string[];
  /** The id of the input a pick fills; it receives focus after the pick. */
  targetId: string;
  value: string;
  onPick: (option: string) => void;
  /** Names the group for screen readers, e.g. "Quick picks for your physical habit". */
  label: string;
  disabled?: boolean;
  testIdPrefix: string;
}) {
  const current = value.trim().toLowerCase();

  const pick = (option: string) => {
    onPick(option);
    requestAnimationFrame(() => {
      const input = document.getElementById(targetId);
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        input.focus();
        input.setSelectionRange(option.length, option.length);
      }
    });
  };

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option, i) => {
        const active = current === option.toLowerCase();
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => pick(option)}
            aria-label={`Use "${option}"`}
            data-testid={`${testIdPrefix}-${i}`}
            className={`k-press min-h-9 rounded-full border px-3 py-1 text-xs font-semibold focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-60 ${
              active
                ? 'border-primary bg-primary-soft text-ink'
                : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
