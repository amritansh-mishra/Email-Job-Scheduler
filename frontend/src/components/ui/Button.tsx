import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'outline' | 'soft' | 'ghost';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  outline: 'border border-brand text-brand bg-white hover:bg-brand-soft',
  soft: 'bg-brand-soft text-ink hover:brightness-95',
  ghost: 'text-ink hover:bg-field',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-4 text-xs rounded-full',
  md: 'h-9 px-4 text-[13px] rounded-lg',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  );
}

/** Square icon button used in toolbars and headers. */
export function IconButton({ className, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-field hover:text-ink disabled:opacity-40',
        active && 'bg-field text-ink',
        className,
      )}
    />
  );
}
