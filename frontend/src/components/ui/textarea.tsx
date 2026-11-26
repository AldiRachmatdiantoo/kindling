import * as React from 'react';

import { cn } from '@/lib/utils';

/** shadcn/ui Textarea on Kindling's tokens, matching Input. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-24 w-full rounded-2xl border border-line-strong bg-surface-2 px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:ring-4 focus:ring-primary/25 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-peach-strong',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
