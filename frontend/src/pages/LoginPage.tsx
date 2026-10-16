import { useEffect, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { GoogleIcon } from '../components/ui/GoogleIcon';
import { FilledInput } from '../components/ui/Input';
import { FullPageSpinner } from '../components/ui/States';
import { useMe } from '../hooks/queries';
import { oauthUrls } from '../lib/api';

export function LoginPage() {
  const { data: user, isLoading } = useMe();
  const [params] = useSearchParams();
  const error = params.get('error');

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  if (isLoading) return <FullPageSpinner />;
  if (user) return <Navigate to="/scheduled" replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    toast.info('Email sign-in is not enabled yet. Please continue with Google.');
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-[340px] rounded-xl border border-line px-8 py-7">
        <h1 className="mb-5 text-center text-2xl font-bold">Login</h1>
        <Button variant="soft" className="w-full text-xs font-normal" onClick={() => (window.location.href = oauthUrls.google)}>
          <GoogleIcon /> Login with Google
        </Button>

        <div className="my-4 flex items-center gap-3 text-[10px] text-muted">
          <span className="h-px flex-1 bg-line" /> or sign up through email <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
          <FilledInput type="email" placeholder="Email ID" autoComplete="email" required />
          <FilledInput type="password" placeholder="Password" autoComplete="current-password" required />
          <Button type="submit" className="mt-2.5 w-full text-xs font-normal">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}
