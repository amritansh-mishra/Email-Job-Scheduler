import { ArrowLeft, Clock, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RecipientField } from '../components/compose/RecipientField';
import { RichTextEditor } from '../components/compose/RichTextEditor';
import { SendLaterPanel } from '../components/compose/SendLaterPopover';
import { SenderSelect } from '../components/compose/SenderSelect';
import { Button, IconButton } from '../components/ui/Button';
import { BareInput, BoxInput } from '../components/ui/Input';
import { Popover } from '../components/ui/Popover';
import { useInvalidateEmails, useSenders } from '../hooks/queries';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';

function Row({ label, children, divider = true }: { label: string; children: ReactNode; divider?: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-2 ${divider ? 'border-b border-line' : ''}`}>
      <span className="w-12 shrink-0 text-xs">{label}</span>
      {children}
    </div>
  );
}

export function ComposePage() {
  const navigate = useNavigate();
  const invalidate = useInvalidateEmails();
  const { data: senders } = useSenders();
  const fileRef = useRef<HTMLInputElement>(null);

  const [senderId, setSenderId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState({ html: '', empty: true });
  const [delaySeconds, setDelaySeconds] = useState('');
  const [hourlyLimit, setHourlyLimit] = useState('');
  const [sendAt, setSendAt] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!senderId && senders?.[0]) setSenderId(senders[0].id);
  }, [senders, senderId]);

  const submit = async () => {
    const problem = !senderId
      ? 'Pick a sender'
      : !recipients.length
        ? 'Add at least one recipient or upload a list'
        : !subject.trim()
          ? 'Subject is required'
          : body.empty
            ? 'Write something in the body'
            : null;
    if (problem) return toast.error(problem);

    setSubmitting(true);
    try {
      const res = await api.createCampaign({
        senderId,
        subject: subject.trim(),
        bodyHtml: body.html,
        recipients,
        startAt: (sendAt ?? new Date()).toISOString(),
        delayBetweenSeconds: Number(delaySeconds) || 0,
        hourlyLimit: Number(hourlyLimit) || 0,
      });
      invalidate();
      toast.success(`Scheduled ${res.scheduled} email${res.scheduled === 1 ? '' : 's'}`, {
        description: `First send ${formatDateTime(res.firstSendAt)}`,
      });
      navigate('/scheduled');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 py-3">
        <IconButton aria-label="Back" onClick={() => navigate(-1)} className="text-ink">
          <ArrowLeft className="size-4" />
        </IconButton>
        <h1 className="flex-1 text-base">Compose New Email</h1>
        <IconButton aria-label="Upload leads list" title="Upload leads (CSV / TXT)" onClick={() => fileRef.current?.click()} className={recipients.length ? 'text-brand' : ''}>
          <Paperclip className="size-4" />
        </IconButton>
        {sendAt && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px]">
            {formatDateTime(sendAt.toISOString())}
            <button type="button" aria-label="Clear send time" onClick={() => setSendAt(null)}>
              <X className="size-3" />
            </button>
          </span>
        )}
        <Popover
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          anchor={
            <IconButton aria-label="Send later" active={pickerOpen} onClick={() => setPickerOpen((o) => !o)} className={sendAt ? 'text-brand' : ''}>
              <Clock className="size-4" />
            </IconButton>
          }
        >
          <SendLaterPanel
            initial={sendAt}
            onCancel={() => setPickerOpen(false)}
            onDone={(d) => {
              setSendAt(d);
              setPickerOpen(false);
            }}
          />
        </Popover>
        <Button size="sm" variant="outline" loading={submitting} onClick={submit}>
          {sendAt ? 'Send Later' : 'Send'}
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-4 pb-8">
        <Row label="From" divider={false}>
          <SenderSelect value={senderId} onChange={setSenderId} />
        </Row>
        <Row label="To">
          <div className="flex-1">
            <RecipientField value={recipients} onChange={setRecipients} fileInputRef={fileRef} />
          </div>
        </Row>
        <Row label="Subject">
          <BareInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={300} />
        </Row>
        <div className="flex items-center gap-3 py-3 text-xs">
          <label className="flex items-center gap-2">
            Delay between 2 emails
            <BoxInput type="number" min={0} max={3600} placeholder="00" value={delaySeconds} onChange={(e) => setDelaySeconds(e.target.value)} aria-describedby="delay-hint" />
          </label>
          <label className="ml-6 flex items-center gap-2">
            Hourly Limit
            <BoxInput type="number" min={0} placeholder="00" value={hourlyLimit} onChange={(e) => setHourlyLimit(e.target.value)} />
          </label>
          <span id="delay-hint" className="ml-auto text-[10px] text-muted">
            Delay in seconds · 0 = server defaults
          </span>
        </div>
        <RichTextEditor onChange={(html, empty) => setBody({ html, empty })} />
      </div>
    </div>
  );
}
