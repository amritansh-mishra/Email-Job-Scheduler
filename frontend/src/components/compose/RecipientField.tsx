import { Upload, X } from 'lucide-react';
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { extractEmails, isEmail } from '../../lib/leads';
import { BareInput } from '../ui/Input';

const VISIBLE_CHIPS = 3;

interface Props {
  value: string[];
  onChange: (emails: string[]) => void;
  /** Lets the header paperclip open the same file picker. */
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function RecipientField({ value, onChange, fileInputRef }: Props) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);
  const fileRef = fileInputRef ?? localRef;

  const add = (emails: string[]) => {
    const merged = [...new Set([...value, ...emails.map((e) => e.toLowerCase())])];
    onChange(merged);
    return merged.length - value.length;
  };

  const commitDraft = () => {
    const parts = draft.split(/[\s,;]+/).filter(Boolean);
    const valid = parts.filter(isEmail);
    if (parts.length && !valid.length) return toast.error(`"${draft}" is not a valid email`);
    add(valid);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ';', 'Tab'].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const found = extractEmails(e.clipboardData.getData('text'));
    if (found.length > 1) {
      e.preventDefault();
      add(found);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const found = extractEmails(await file.text());
    if (!found.length) return toast.error(`No email addresses found in ${file.name}`);
    const added = add(found);
    toast.success(`${found.length} email addresses detected in ${file.name}`, {
      description: added < found.length ? `${found.length - added} were already in the list` : undefined,
    });
  };

  const shown = expanded ? value : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - shown.length;

  return (
    <div className="flex items-start gap-2">
      <div className="flex min-h-7 flex-1 flex-wrap items-center gap-1">
        {shown.map((email) => (
          <span key={email} className="inline-flex h-5 items-center gap-1 rounded-full border border-brand px-2 text-[10px]">
            {email}
            <button type="button" aria-label={`Remove ${email}`} onClick={() => onChange(value.filter((v) => v !== email))}>
              <X className="size-2.5 text-muted hover:text-ink" />
            </button>
          </span>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex h-5 items-center rounded-full border border-brand bg-brand-soft px-2 text-[10px] font-medium"
          >
            +{hidden}
          </button>
        )}
        {expanded && value.length > VISIBLE_CHIPS && (
          <button type="button" onClick={() => setExpanded(false)} className="text-[10px] text-muted underline">
            show less
          </button>
        )}
        <BareInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => draft.trim() && commitDraft()}
          placeholder={value.length ? '' : 'recipient@example.com'}
          className="min-w-40"
        />
      </div>
      {value.length > 0 && <span className="pt-1.5 text-[10px] whitespace-nowrap text-muted">{value.length} recipients</span>}
      <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 pt-1 text-xs whitespace-nowrap text-brand">
        <Upload className="size-3.5" /> Upload List
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
