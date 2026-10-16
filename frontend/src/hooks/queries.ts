import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ListParams } from '../lib/api';

export const keys = {
  me: ['me'] as const,
  senders: ['senders'] as const,
  emails: (p: ListParams) => ['emails', p] as const,
  allEmails: ['emails'] as const,
  counts: ['counts'] as const,
  email: (id: string) => ['email', id] as const,
  slack: ['slack'] as const,
};

/** Lists refresh on their own so you can watch scheduled emails turn into sent ones. */
const LIVE_REFRESH_MS = 5000;

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.me, retry: false, staleTime: 5 * 60_000 });
export const useSenders = () => useQuery({ queryKey: keys.senders, queryFn: api.senders });
export const useCounts = () => useQuery({ queryKey: keys.counts, queryFn: api.counts, refetchInterval: LIVE_REFRESH_MS });
export const useSlack = () => useQuery({ queryKey: keys.slack, queryFn: api.slack });

export const useEmails = (params: ListParams) =>
  useQuery({
    queryKey: keys.emails(params),
    queryFn: () => api.emails(params),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });

export const useEmail = (id: string) =>
  useQuery({ queryKey: keys.email(id), queryFn: () => api.email(id), refetchInterval: LIVE_REFRESH_MS });

/** Invalidates everything derived from the email list after a write. */
export function useInvalidateEmails() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.allEmails });
    void qc.invalidateQueries({ queryKey: keys.counts });
  };
}

export function useToggleStar() {
  const qc = useQueryClient();
  const invalidate = useInvalidateEmails();
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => api.setStarred(id, starred),
    onSuccess: (_, { id }) => {
      invalidate();
      void qc.invalidateQueries({ queryKey: keys.email(id) });
    },
  });
}

export function useDeleteEmail() {
  const invalidate = useInvalidateEmails();
  return useMutation({ mutationFn: api.deleteEmail, onSuccess: invalidate });
}
