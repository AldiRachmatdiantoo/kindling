import * as React from 'react';

import { cn } from '@/lib/utils';

/** shadcn/ui Input on Kindling's tokens (the k-input look: a well with a 3:1 control border). */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'w-full min-w-0 rounded-2xl border border-line-strong bg-surface-2 px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:ring-4 focus:ring-primary/25 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-peach-strong',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
