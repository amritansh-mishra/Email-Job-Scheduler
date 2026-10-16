import clsx from 'clsx';
import { Clock, Send } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useCounts } from '../../hooks/queries';
import { Logo } from '../ui/Logo';
import { SlackCard } from './SlackCard';
import { UserMenu } from './UserMenu';

const nav = [
  { to: '/scheduled', label: 'Scheduled', icon: Clock, count: 'scheduled' },
  { to: '/sent', label: 'Sent', icon: Send, count: 'sent' },
] as const;

export function Sidebar() {
  const { data: counts } = useCounts();

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-3 px-3 py-4">
      <div className="px-1 pb-1">
        <Logo />
      </div>
      <UserMenu />
      <Link
        to="/compose"
        className="flex h-8 items-center justify-center rounded-full border border-brand text-xs font-medium text-brand transition-colors hover:bg-brand-soft"
      >
        Compose
      </Link>

      <p className="mt-2 px-1 text-[10px] font-medium tracking-wide text-muted uppercase">Core</p>
      <nav className="-mt-1 flex flex-col gap-0.5">
        {nav.map(({ to, label, icon: Icon, count }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-xs',
                isActive ? 'bg-brand-soft font-semibold' : 'hover:bg-field',
              )
            }
          >
            <Icon className="size-3.5" />
            <span className="flex-1">{label}</span>
            <span className="text-[10px] text-muted">{counts?.[count] ?? ''}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <SlackCard />
      </div>
    </aside>
  );
}
