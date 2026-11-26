import { Flame } from 'lucide-react';

/** The brand mark: a flame (the product is named after kindling a fire) in a lime coin. */
export function KindlingMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14' : 'h-9 w-9';
  const icon = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-lime text-ink ${box}`}
      aria-hidden="true"
    >
      <Flame className={icon} />
    </span>
  );
}
