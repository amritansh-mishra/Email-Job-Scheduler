import clsx from 'clsx';
import type { ReactNode } from 'react';

type Tone = 'warn' | 'neutral' | 'danger' | 'info' | 'brand';

const tones: Record<Tone, string> = {
  warn: 'bg-warn-soft text-warn',
  neutral: 'bg-field text-ink/70',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-sky-50 text-sky-700',
  brand: 'border border-brand text-ink bg-white',
};

export function Pill({ tone, icon, children, className }: { tone: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-medium whitespace-nowrap', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
