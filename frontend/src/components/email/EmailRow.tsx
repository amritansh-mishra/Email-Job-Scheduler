import { useNavigate } from 'react-router-dom';
import { formatShort } from '../../lib/format';
import type { EmailListItem } from '../../lib/types';
import { StarButton } from './StarButton';
import { StatusPill } from './StatusPill';

export function EmailRow({ email }: { email: EmailListItem }) {
  const navigate = useNavigate();
  return (
    <li
      onClick={() => navigate(`/emails/${email.id}`)}
      className="flex cursor-pointer items-center gap-4 border-b border-line px-3 py-2.5 hover:bg-field/60"
    >
      <span className="w-40 shrink-0 truncate text-xs font-medium" title={email.toEmail}>
        To: {email.toEmail}
      </span>
      <StatusPill email={email} />
      <p className="min-w-0 flex-1 truncate text-xs">
        <span className="font-semibold">{email.subject}</span>
        <span className="text-muted"> - {email.preview}</span>
      </p>
      {email.sentAt && (
        <time className="shrink-0 text-[10px] text-muted" dateTime={email.sentAt} title={new Date(email.sentAt).toLocaleString()}>
          {formatShort(email.sentAt)}
        </time>
      )}
      <StarButton id={email.id} starred={email.starred} />
    </li>
  );
}
