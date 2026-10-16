import { Clock } from 'lucide-react';
import { formatPillTime } from '../../lib/format';
import type { EmailListItem } from '../../lib/types';
import { Pill } from '../ui/Pill';

export function StatusPill({ email }: { email: Pick<EmailListItem, 'status' | 'scheduledAt'> }) {
  switch (email.status) {
    case 'scheduled':
      return (
        <Pill tone="warn" icon={<Clock className="size-2.5" />}>
          {formatPillTime(email.scheduledAt)}
        </Pill>
      );
    case 'sending':
      return <Pill tone="info">Sending…</Pill>;
    case 'sent':
      return <Pill tone="neutral">Sent</Pill>;
    case 'failed':
      return <Pill tone="danger">Failed</Pill>;
    case 'cancelled':
      return <Pill tone="neutral">Cancelled</Pill>;
  }
}
