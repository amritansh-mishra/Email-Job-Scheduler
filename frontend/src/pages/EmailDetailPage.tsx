import DOMPurify from 'dompurify';
import { Archive, ArrowLeft, ChevronDown, ExternalLink, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { StarButton } from '../components/email/StarButton';
import { StatusPill } from '../components/email/StatusPill';
import { Avatar } from '../components/ui/Avatar';
import { IconButton } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Modal';
import { ErrorState, FullPageSpinner } from '../components/ui/States';
import { useDeleteEmail, useEmail, useMe } from '../hooks/queries';
import { formatDateTime } from '../lib/format';

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: email, isLoading, isError, error, refetch } = useEmail(id);
  const del = useDeleteEmail();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const html = useMemo(() => DOMPurify.sanitize(email?.bodyHtml ?? ''), [email?.bodyHtml]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/scheduled'));

  const isScheduled = email?.status === 'scheduled';

  const onDelete = () => {
    if (!email) return;
    del.mutate(email.id, {
      onSuccess: () => {
        toast.success(isScheduled ? 'Scheduled email cancelled' : 'Email deleted');
        setConfirmOpen(false);
        back();
      },
      onError: (e) => {
        toast.error(e.message);
        setConfirmOpen(false);
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <ConfirmDialog
        open={confirmOpen}
        title={isScheduled ? 'Cancel scheduled email?' : 'Delete email?'}
        message={isScheduled ? 'It will not be sent. This cannot be undone.' : 'It will be removed from your Sent list.'}
        confirmLabel={isScheduled ? 'Cancel email' : 'Delete'}
        loading={del.isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <IconButton aria-label="Back" onClick={back} className="text-ink">
          <ArrowLeft className="size-4" />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-base">{email?.subject ?? ''}</h1>
        {email && (
          <>
            <StarButton id={email.id} starred={email.starred} />
            <IconButton aria-label="Archive" title="Archive is not part of this demo" disabled>
              <Archive className="size-3.5" />
            </IconButton>
            <IconButton aria-label="Delete" onClick={() => setConfirmOpen(true)} disabled={email.status === 'sending' || del.isPending}>
              <Trash2 className="size-3.5" />
            </IconButton>
            <span className="mx-1 h-5 w-px bg-line" />
          </>
        )}
        {me && <Avatar name={me.name} src={me.avatarUrl} />}
      </header>

      {isLoading ? (
        <FullPageSpinner />
      ) : isError || !email ? (
        <ErrorState message={(error as Error | null)?.message ?? 'Email not found'} onRetry={() => void refetch()} />
      ) : (
        <article className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-5 flex items-start gap-3">
            <Avatar name={email.senderName} />
            <div className="min-w-0 flex-1">
              <p className="text-xs">
                <span className="font-semibold">{email.senderName}</span>{' '}
                <span className="text-[10px] text-muted">&lt;{email.senderEmail}&gt;</span>
              </p>
              <p className="flex items-center gap-0.5 text-[10px] text-muted">
                to {email.toEmail} <ChevronDown className="size-3" />
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-muted">{formatDateTime(email.sentAt ?? email.scheduledAt)}</span>
              <StatusPill email={email} />
            </div>
          </div>

          <StatusNote email={email} />

          <div className="rich-text pl-11 text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      )}
    </div>
  );
}

function StatusNote({ email }: { email: NonNullable<ReturnType<typeof useEmail>['data']> }) {
  const base = 'mb-5 ml-11 rounded-lg px-3 py-2 text-[11px]';
  if (email.status === 'scheduled') {
    return <p className={`${base} bg-warn-soft text-warn`}>Scheduled to send {formatDateTime(email.scheduledAt)}.</p>;
  }
  if (email.status === 'failed') {
    return (
      <p className={`${base} bg-red-50 text-red-700`}>
        Failed after {email.attempts} attempt{email.attempts === 1 ? '' : 's'}: {email.error}
      </p>
    );
  }
  if (email.status === 'sent' && email.previewUrl) {
    return (
      <a href={email.previewUrl} target="_blank" rel="noreferrer" className={`${base} flex w-fit items-center gap-1.5 bg-brand-soft text-brand`}>
        Delivered to Ethereal: view the captured message <ExternalLink className="size-3" />
      </a>
    );
  }
  return null;
}
