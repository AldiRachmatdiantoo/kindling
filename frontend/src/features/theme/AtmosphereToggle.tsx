import { Palette } from 'lucide-react';
import { setAtmosphereEnabled, useAtmosphereEnabled } from './atmosphere';
import { Card } from '@/components/ui/card';

/** Profile preference: let today's check-in tint the accent colors and motion pace. */
export function AtmosphereToggle() {
  const enabled = useAtmosphereEnabled();

  return (
    <Card asChild className="p-5 sm:p-6">
      <section aria-labelledby="atmosphere-title" data-testid="atmosphere-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
              aria-hidden="true"
            >
              <Palette className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="atmosphere-title" className="text-lg font-bold text-ink">
                <label htmlFor="atmosphere-switch">Match colors to my day</label>
              </h2>
              <p id="atmosphere-desc" className="mt-0.5 text-sm text-ink-soft">
                After your check-in the accent color and motion follow your energy: warmer and
                slower on a heavy day, fresher when you have more to give.
              </p>
            </div>
          </div>
          <button
            id="atmosphere-switch"
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-describedby="atmosphere-desc"
            onClick={() => setAtmosphereEnabled(!enabled)}
            data-testid="atmosphere-toggle"
            className="group flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full"
          >
            <span
              className={`relative h-7 w-12 rounded-full border transition-colors duration-150 ${
                enabled ? 'border-primary bg-primary' : 'border-line-strong bg-surface-2'
              }`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-1/2 left-0.5 h-5 w-5 -translate-y-1/2 rounded-full shadow-sm transition-transform duration-150 motion-reduce:transition-none ${
                  enabled ? 'translate-x-5 bg-white' : 'bg-ink-faint'
                }`}
              />
            </span>
          </button>
        </div>
      </section>
    </Card>
  );
}
