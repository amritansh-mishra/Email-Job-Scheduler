import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Clock, Filter, RotateCw, Search, Send, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmailRow } from '../components/email/EmailRow';
import { Pagination } from '../components/email/Pagination';
import { ButtonLink, IconButton } from '../components/ui/Button';
import { Popover } from '../components/ui/Popover';
import { EmptyState, ErrorState, ListSkeleton } from '../components/ui/States';
import { keys, useEmails } from '../hooks/queries';
import type { Tab } from '../lib/types';

const EMPTY: Record<Tab, { title: string; description: string; icon: React.ReactNode }> = {
  scheduled: {
    title: 'No scheduled emails',
    description: 'Emails you schedule will wait here until they are sent.',
    icon: <Clock className="size-5" />,
  },
  sent: {
    title: 'No sent emails yet',
    description: 'Once scheduled emails go out, they show up here with their status.',
    icon: <Send className="size-5" />,
  },
};

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function InboxPage({ tab }: { tab: Tab }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [filterOpen, setFilterOpen] = useState(false);
  const q = useDebounced(search.trim());
  const page = Number(params.get('page') ?? 1);
  const starred = params.get('starred') === 'true';
  const qc = useQueryClient();

  const update = (patch: Record<string, string | null>) =>
    setParams((p) => {
      Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
      return p;
    });

  useEffect(() => {
    if (q !== (params.get('q') ?? '')) update({ q: q || null, page: null });
  }, [q]);

  const { data, isLoading, isError, error, refetch, isFetching } = useEmails({ tab, q: q || undefined, page, starred });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.allEmails });
    void qc.invalidateQueries({ queryKey: keys.counts });
  };

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex h-8 flex-1 items-center gap-2 rounded-full bg-field px-3">
          <Search className="size-3.5 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
          />
        </label>
        <Popover
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          className="w-40 py-1"
          anchor={
            <IconButton aria-label="Filter" active={starred} onClick={() => setFilterOpen((o) => !o)}>
              <Filter className="size-3.5" />
            </IconButton>
          }
        >
          <button
            type="button"
            onClick={() => {
              update({ starred: starred ? null : 'true', page: null });
              setFilterOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-field"
          >
            <Star className={clsx('size-3.5', starred && 'fill-amber-400 text-amber-400')} />
            {starred ? 'Show all' : 'Starred only'}
          </button>
        </Popover>
        <IconButton aria-label="Refresh" onClick={refresh}>
          <RotateCw className={clsx('size-3.5', isFetching && 'animate-spin')} />
        </IconButton>
        {data && <Pagination page={page} limit={data.limit} total={data.total} onPage={(p) => update({ page: String(p) })} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
        ) : !data?.items.length ? (
          q || starred ? (
            <EmptyState icon={<Search className="size-5" />} title="No matching emails" description="Try a different search or clear the filter." />
          ) : (
            <EmptyState
              {...EMPTY[tab]}
              action={
                <ButtonLink to="/compose" variant="outline" size="sm">
                  Compose
                </ButtonLink>
              }
            />
          )
        ) : (
          <ul>
            {data.items.map((email) => (
              <EmailRow key={email.id} email={email} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
