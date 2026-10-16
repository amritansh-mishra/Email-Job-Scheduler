import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { keys, useSenders } from '../../hooks/queries';
import { api } from '../../lib/api';
import { Popover } from '../ui/Popover';
import { Spinner } from '../ui/Spinner';

export function SenderSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: senders, isLoading } = useSenders();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const current = senders?.find((s) => s.id === value);

  const addSender = async () => {
    setAdding(true);
    try {
      const s = await api.addSender();
      await qc.invalidateQueries({ queryKey: keys.senders });
      onChange(s.id);
      toast.success(`Added sender ${s.email}`);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      className="w-72 py-1"
      anchor={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-field px-2.5 text-xs"
        >
          {isLoading ? <Spinner className="size-3" /> : (current?.email ?? 'Select sender')}
          <ChevronDown className="size-3 text-muted" />
        </button>
      }
    >
      {senders?.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => {
            onChange(s.id);
            setOpen(false);
          }}
          className={clsx('flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-field', s.id === value && 'font-medium')}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate">{s.email}</span>
            <span className="block text-[10px] text-muted">{s.name} · Ethereal</span>
          </span>
          {s.id === value && <Check className="size-3.5 text-brand" />}
        </button>
      ))}
      <button
        type="button"
        onClick={addSender}
        disabled={adding}
        className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-xs text-brand hover:bg-field"
      >
        {adding ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} Add sender (new Ethereal account)
      </button>
    </Popover>
  );
}
