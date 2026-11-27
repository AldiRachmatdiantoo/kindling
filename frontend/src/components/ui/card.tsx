import * as React from 'react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

/*
  shadcn/ui Card, on Kindling's tokens: a softly raised surface with a hairline border
  (the Figma night look). Titles use the serif voice; descriptions the soft ink.
*/
function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  // asChild keeps the card look on a semantic element (section, article) instead of a div.
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      data-slot="card"
      className={cn('rounded-3xl border border-line bg-surface text-ink', className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('font-serif text-xl leading-snug font-bold text-ink', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-ink-soft', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center', className)} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
