import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '../../hooks/queries';
import { FullPageSpinner } from '../ui/States';

export function RequireAuth() {
  const { data, isLoading } = useMe();
  if (isLoading) return <FullPageSpinner />;
  if (!data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
