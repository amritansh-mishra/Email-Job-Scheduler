import { useQueryClient } from '@tanstack/react-query';
import { Slack } from 'lucide-react';
import { toast } from 'sonner';
import { keys, useSlack } from '../../hooks/queries';
import { api, oauthUrls } from '../../lib/api';
import { Button } from '../ui/Button';

/** Connect/disconnect Slack for hourly-limit alerts. */
export function SlackCard() {
  const { data } = useSlack();
  const qc = useQueryClient();
  if (!data) return null;

  const disconnect = async () => {
    await api.slackDisconnect();
    await qc.invalidateQueries({ queryKey: keys.slack });
    toast.success('Slack disconnected');
  };
  const test = () =>
    api.slackTest().then(
      () => toast.success('Test message sent to Slack'),
      (e: Error) => toast.error(e.message),
    );

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
        <Slack className="size-3.5" /> Slack alerts
      </div>
      {data.connected ? (
        <>
          <p className="mb-2 text-[10px] text-muted">
            Posting to <span className="text-ink">{data.channel}</span> in {data.teamName}
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-6 px-2.5 text-[10px]" onClick={test}>
              Test
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2.5 text-[10px]" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-[10px] text-muted">Get notified when a sender hits its hourly limit.</p>
          <Button
            size="sm"
            variant="outline"
            className="h-6 w-full text-[10px]"
            disabled={!data.configured}
            title={data.configured ? undefined : 'Set SLACK_CLIENT_ID / SECRET on the server'}
            onClick={() => (window.location.href = oauthUrls.slack)}
          >
            Connect Slack
          </Button>
        </>
      )}
    </div>
  );
}
