import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/*
  shadcn/ui Progress (Radix), with one Kindling addition: indicatorClassName, so each score
  keeps its own signal color, and indicatorProps for test ids or a fill animation class.
*/
function Progress({
  className,
  value,
  indicatorClassName,
  indicatorProps,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
  indicatorProps?: React.ComponentProps<typeof ProgressPrimitive.Indicator> & {
    'data-testid'?: string;
  };
}) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={pct}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        {...indicatorProps}
        className={cn('h-full rounded-full bg-lime', indicatorClassName, indicatorProps?.className)}
        style={{ width: `${pct}%`, ...indicatorProps?.style }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
