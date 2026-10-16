import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth } from './components/layout/RequireAuth';
import { FullPageSpinner } from './components/ui/States';
import { keys } from './hooks/queries';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { InboxPage } from './pages/InboxPage';
import { LoginPage } from './pages/LoginPage';

// The editor (TipTap/ProseMirror) is most of the bundle; load it only for Compose.
const ComposePage = lazy(() => import('./pages/ComposePage').then((m) => ({ default: m.ComposePage })));

const SLACK_MESSAGES: Record<string, [kind: 'success' | 'error', text: string]> = {
  connected: ['success', 'Slack connected. A confirmation was posted to your channel.'],
  cancelled: ['error', 'Slack connection was cancelled'],
  expired: ['error', 'Slack connection link expired, please try again'],
  error: ['error', 'Could not connect Slack'],
};

/** Shows the result of the Slack OAuth round-trip (?slack=...) once. */
function SlackResultToast() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const result = params.get('slack');
  useEffect(() => {
    const msg = result && SLACK_MESSAGES[result];
    if (!msg) return;
    toast[msg[0]](msg[1]);
    void qc.invalidateQueries({ queryKey: keys.slack });
    setParams((p) => {
      p.delete('slack');
      return p;
    }, { replace: true });
  }, [result, qc, setParams]);
  return null;
}

export function App() {
  return (
    <>
      <SlackResultToast />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/scheduled" element={<InboxPage key="scheduled" tab="scheduled" />} />
            <Route path="/sent" element={<InboxPage key="sent" tab="sent" />} />
          </Route>
          <Route
            path="/compose"
            element={
              <Suspense fallback={<FullPageSpinner />}>
                <ComposePage />
              </Suspense>
            }
          />
          <Route path="/emails/:id" element={<EmailDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/scheduled" replace />} />
      </Routes>
    </>
  );
}
