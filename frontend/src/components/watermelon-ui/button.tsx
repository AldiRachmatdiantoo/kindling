import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
  Watermelon UI button (registry.watermelon.sh/r/button.json), restyled to Kindling's
  outlined look. Solid variants sit on a chunky ink "lip" (k-press in index.css) that
  sinks when pressed and springs back on release, so every tap feels answered.
*/
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold outline-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='h-'])]:h-4 [&_svg:not([class*='w-'])]:w-4",
  {
    variants: {
      variant: {
        primary: 'k-press border-[1.5px] border-ink bg-lime text-ink hover:bg-lime-dark',
        secondary: 'k-press border-[1.5px] border-ink bg-surface text-ink hover:bg-primary-soft',
        ghost:
          'k-press-soft font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline',
        link: 'k-press-soft text-primary underline-offset-4 hover:text-primary-dark hover:underline',
      },
      size: {
        default: 'min-h-11 px-6 py-2.5 text-sm',
        sm: 'min-h-11 px-4 py-2 text-xs',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'primary',
  size = 'default',
  asChild = false,
  type,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
