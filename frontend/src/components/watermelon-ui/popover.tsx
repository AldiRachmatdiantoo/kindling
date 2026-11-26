import * as React from 'react';
import { Popover as PopoverPrime } from 'radix-ui';
import { cn } from '@/lib/utils';

type PopoverProps = PopoverPrimitiveProps;

function Popover(props: PopoverProps) {
  return <PopoverPrimitive {...props} />;
}

type PopoverTriggerProps = PopoverTriggerPrimitiveProps;

function PopoverTrigger(props: PopoverTriggerProps) {
  return <PopoverTriggerPrimitive {...props} />;
}

type PopoverContentProps = PopoverContentPrimitiveProps;

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPortalPrimitive>
      <PopoverContentPrimitive
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden',
          className,
        )}
        {...props}
      />
    </PopoverPortalPrimitive>
  );
}

type PopoverCloseProps = PopoverClosePrimitiveProps;

function PopoverClose(props: PopoverCloseProps) {
  return <PopoverClosePrimitive {...props} />;
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
  type PopoverProps,
  type PopoverTriggerProps,
  type PopoverContentProps,
  type PopoverCloseProps,
};

type PopoverContextType = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

const [PopoverProvider] = getStrictContext<PopoverContextType>('PopoverContext');

type PopoverPrimitiveProps = React.ComponentProps<typeof PopoverPrime.Root>;

function PopoverPrimitive(props: PopoverPrimitiveProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props?.open,
    defaultValue: props?.defaultOpen,
    onChange: props?.onOpenChange,
  });

  const contextValue = React.useMemo(() => ({ isOpen, setIsOpen }), [isOpen, setIsOpen]);

  return (
    <PopoverProvider value={contextValue}>
      <PopoverPrime.Root data-slot="popover" {...props} onOpenChange={setIsOpen} />
    </PopoverProvider>
  );
}

type PopoverTriggerPrimitiveProps = React.ComponentProps<typeof PopoverPrime.Trigger>;

function PopoverTriggerPrimitive(props: PopoverTriggerPrimitiveProps) {
  return <PopoverPrime.Trigger data-slot="popover-trigger" {...props} />;
}

type PopoverPortalPrimitiveProps = React.ComponentProps<typeof PopoverPrime.Portal>;

function PopoverPortalPrimitive(props: PopoverPortalPrimitiveProps) {
  return <PopoverPrime.Portal data-slot="popover-portal" {...props} />;
}

type PopoverContentPrimitiveProps = React.ComponentProps<typeof PopoverPrime.Content>;

function PopoverContentPrimitive({ className, ...props }: PopoverContentPrimitiveProps) {
  return (
    <PopoverPrime.Content
      data-slot="popover-content"
      className={cn('k-popover', className)}
      {...props}
    />
  );
}

type PopoverAnchorPrimitiveProps = React.ComponentProps<typeof PopoverPrime.Anchor>;

export function PopoverAnchorPrimitive({ ...props }: PopoverAnchorPrimitiveProps) {
  return <PopoverPrime.Anchor data-slot="popover-anchor" {...props} />;
}

type PopoverArrowProps = React.ComponentProps<typeof PopoverPrime.Arrow>;

export function PopoverArrowPrimitive(props: PopoverArrowProps) {
  return <PopoverPrime.Arrow data-slot="popover-arrow" {...props} />;
}

type PopoverClosePrimitiveProps = React.ComponentProps<typeof PopoverPrime.Close>;

function PopoverClosePrimitive(props: PopoverClosePrimitiveProps) {
  return <PopoverPrime.Close data-slot="popover-close" {...props} />;
}

function getStrictContext<T>(
  name?: string,
): readonly [
  ({ value, children }: { value: T; children?: React.ReactNode }) => React.JSX.Element,
  () => T,
] {
  const Context = React.createContext<T | undefined>(undefined);

  const Provider = ({ value, children }: { value: T; children?: React.ReactNode }) => (
    <Context.Provider value={value}>{children}</Context.Provider>
  );

  const useSafeContext = () => {
    const ctx = React.useContext(Context);
    if (ctx === undefined) {
      throw new Error(`useContext must be used within ${name ?? 'a Provider'}`);
    }
    return ctx;
  };

  return [Provider, useSafeContext] as const;
}

export { getStrictContext };

interface CommonControlledStateProps<T> {
  value?: T;
  defaultValue?: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useControlledState<T, Rest extends any[] = []>(
  props: CommonControlledStateProps<T> & {
    onChange?: (value: T, ...args: Rest) => void;
  },
): readonly [T, (next: T, ...args: Rest) => void] {
  const { value, defaultValue, onChange } = props;

  const [state, setInternalState] = React.useState<T>(
    value !== undefined ? value : (defaultValue as T),
  );

  React.useEffect(() => {
    if (value !== undefined) setInternalState(value);
  }, [value]);

  const setState = React.useCallback(
    (next: T, ...args: Rest) => {
      setInternalState(next);
      onChange?.(next, ...args);
    },
    [onChange],
  );

  return [state, setState] as const;
}
