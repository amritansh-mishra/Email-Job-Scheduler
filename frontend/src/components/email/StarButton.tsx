import clsx from 'clsx';
import { Star } from 'lucide-react';
import { useToggleStar } from '../../hooks/queries';
import { IconButton } from '../ui/Button';

export function StarButton({ id, starred }: { id: string; starred: boolean }) {
  const toggle = useToggleStar();
  return (
    <IconButton
      aria-label={starred ? 'Unstar' : 'Star'}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ id, starred: !starred });
      }}
    >
      <Star className={clsx('size-3.5', starred && 'fill-amber-400 text-amber-400')} />
    </IconButton>
  );
}
