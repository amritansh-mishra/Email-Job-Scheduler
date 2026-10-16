import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../ui/Button';

export function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  if (total <= limit) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted">
      <span className="mr-1">
        {from}–{to} of {total}
      </span>
      <IconButton aria-label="Previous page" disabled={page === 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="size-3.5" />
      </IconButton>
      <IconButton aria-label="Next page" disabled={to >= total} onClick={() => onPage(page + 1)}>
        <ChevronRight className="size-3.5" />
      </IconButton>
    </div>
  );
}
