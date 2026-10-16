import clsx from 'clsx';
import { initials } from '../../lib/format';

interface Props {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ name, src, size = 'md', className }: Props) {
  const dims = size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs';
  if (src) {
    return <img src={src} alt={name} referrerPolicy="no-referrer" className={clsx('shrink-0 rounded-full object-cover', dims, className)} />;
  }
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-white', dims, className)}>
      {initials(name)}
    </span>
  );
}
