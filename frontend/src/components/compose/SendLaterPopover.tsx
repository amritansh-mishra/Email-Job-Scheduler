import clsx from 'clsx';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/Button';

interface Preset {
  label: string;
  at: () => Date;
}

function tomorrowAt(hours?: number) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (hours !== undefined) d.setHours(hours, 0, 0, 0);
  return d;
}

const PRESETS: Preset[] = [
  { label: 'Tomorrow', at: () => tomorrowAt() },
  { label: 'Tomorrow, 10:00 AM', at: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', at: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', at: () => tomorrowAt(15) },
];

/** <input type="datetime-local"> wants local time without a zone. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SendLaterPanel({ initial, onDone, onCancel }: { initial: Date | null; onDone: (d: Date) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial ? toLocalInput(initial) : '');
  const [preset, setPreset] = useState<string | null>(null);
  const picked = value ? new Date(value) : null;
  const inPast = picked !== null && picked.getTime() < Date.now() - 60_000;

  return (
    <div className="w-64 p-3">
      <p className="mb-3 text-xs font-semibold">Send Later</p>
      <label className="flex items-center gap-2 border-b border-line pb-2">
        <input
          type="datetime-local"
          value={value}
          min={toLocalInput(new Date())}
          onChange={(e) => {
            setValue(e.target.value);
            setPreset(null);
          }}
          className="min-w-0 flex-1 text-[11px] text-muted outline-none"
          aria-label="Pick date & time"
        />
        <CalendarDays className="size-3.5 text-muted" />
      </label>
      <ul className="mt-2 mb-6">
        {PRESETS.map((p) => (
          <li key={p.label}>
            <button
              type="button"
              onClick={() => {
                setValue(toLocalInput(p.at()));
                setPreset(p.label);
              }}
              className={clsx('w-full rounded-md px-1 py-1.5 text-left text-[11px] hover:bg-field', preset === p.label && 'bg-brand-soft font-medium')}
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>
      {inPast && <p className="mb-2 text-[10px] text-red-600">Pick a time in the future.</p>}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="text-xs font-medium">
          Cancel
        </button>
        <Button size="sm" variant="outline" disabled={!picked || inPast} onClick={() => picked && onDone(picked)}>
          Done
        </Button>
      </div>
    </div>
  );
}
