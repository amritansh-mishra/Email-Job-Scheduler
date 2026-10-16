/** "Tue 9:15:12 AM" — the pill format in the Figma. */
export function formatPillTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `${day} ${time}`;
}

/** "Nov 3, 10:23 AM" — the email detail header format. */
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Today -> "10:23 AM", otherwise "Nov 3". */
export function formatShort(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function initials(nameOrEmail: string) {
  return (nameOrEmail.trim()[0] ?? '?').toUpperCase();
}
