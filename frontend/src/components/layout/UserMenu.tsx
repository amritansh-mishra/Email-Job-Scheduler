import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../../hooks/queries';
import { api } from '../../lib/api';
import { Avatar } from '../ui/Avatar';
import { Popover } from '../ui/Popover';

export function UserMenu() {
  const { data: user } = useMe();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  if (!user) return null;

  const logout = async () => {
    await api.logout();
    qc.clear();
    navigate('/login', { replace: true });
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      className="w-full"
      anchor={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-lg bg-field px-2 py-2 text-left"
        >
          <Avatar name={user.name} src={user.avatarUrl} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{user.name}</span>
            <span className="block truncate text-[10px] text-muted">{user.email}</span>
          </span>
          <ChevronDown className="size-3.5 text-muted" />
        </button>
      }
    >
      <button type="button" onClick={logout} className="flex w-full items-center gap-2 px-3 py-2.5 text-xs hover:bg-field">
        <LogOut className="size-3.5" /> Logout
      </button>
    </Popover>
  );
}
