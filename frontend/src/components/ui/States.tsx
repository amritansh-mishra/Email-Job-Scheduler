import type { ReactNode } from 'react';
import { Button } from './Button';
import { Spinner } from './Spinner';

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</div>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-sm text-red-600">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <Spinner className="size-6" />
    </div>
  );
}

/** Placeholder rows shaped like the inbox list while it loads. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-busy className="animate-pulse">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 border-b border-line px-3 py-3">
          <div className="h-3 w-28 rounded bg-field" />
          <div className="h-4 w-24 rounded-full bg-field" />
          <div className="h-3 flex-1 rounded bg-field" />
        </li>
      ))}
    </ul>
  );
}
