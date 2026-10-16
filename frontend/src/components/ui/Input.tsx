import clsx from 'clsx';
import { forwardRef, type InputHTMLAttributes } from 'react';

/** Filled field from the login screen. */
export const FilledInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    {...rest}
    className={clsx(
      'h-10 w-full rounded-lg bg-field px-3 text-xs outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/30',
      className,
    )}
  />
));
FilledInput.displayName = 'FilledInput';

/** Borderless field used inside compose rows. */
export const BareInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input ref={ref} {...rest} className={clsx('min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted', className)} />
));
BareInput.displayName = 'BareInput';

/** Small boxed number input ("Delay between 2 emails", "Hourly Limit"). */
export const BoxInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    {...rest}
    className={clsx(
      'h-7 w-14 rounded-md border border-line px-2 text-xs outline-none placeholder:text-muted focus:border-brand',
      className,
    )}
  />
));
BoxInput.displayName = 'BoxInput';
