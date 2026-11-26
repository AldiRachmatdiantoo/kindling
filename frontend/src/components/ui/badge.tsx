import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
  shadcn/ui Badge on Kindling's tokens. Pills carry state, never decoration: a neutral
  chip for labels, "success" for progress that landed, "primary" for the current mode.
*/
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:h-3.5 [&>svg]:w-3.5',
  {
    variants: {
      variant: {
        default: 'border-line bg-surface-2 text-ink',
        outline: 'border-line-strong bg-transparent text-ink',
        primary: 'border-primary bg-primary-soft text-ink',
        success: 'border-mint-strong bg-transparent text-mint-strong',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
