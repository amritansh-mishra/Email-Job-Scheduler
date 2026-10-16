import type {
  CreateCampaignInput,
  CreateCampaignResult,
  EmailCounts,
  EmailDetail,
  EmailList,
  Sender,
  SlackStatus,
  Tab,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({ method, body: data ? JSON.stringify(data) : undefined });

export interface ListParams {
  tab: Tab;
  q?: string;
  page?: number;
  starred?: boolean;
}

export const api = {
  me: () => request<User>('/auth/me'),
  logout: () => request<void>('/auth/logout', json('POST')),

  senders: () => request<Sender[]>('/senders'),
  addSender: (name?: string) => request<Sender>('/senders', json('POST', { name })),

  emails: ({ tab, q, page = 1, starred }: ListParams) => {
    const qs = new URLSearchParams({ tab, page: String(page) });
    if (q) qs.set('q', q);
    if (starred) qs.set('starred', 'true');
    return request<EmailList>(`/emails?${qs}`);
  },
  counts: () => request<EmailCounts>('/emails/counts'),
  email: (id: string) => request<EmailDetail>(`/emails/${id}`),
  setStarred: (id: string, starred: boolean) => request<{ id: string; starred: boolean }>(`/emails/${id}`, json('PATCH', { starred })),
  deleteEmail: (id: string) => request<void>(`/emails/${id}`, json('DELETE')),

  createCampaign: (input: CreateCampaignInput) => request<CreateCampaignResult>('/campaigns', json('POST', input)),

  slack: () => request<SlackStatus>('/slack'),
  slackTest: () => request<{ ok: boolean }>('/slack/test', json('POST')),
  slackDisconnect: () => request<void>('/slack', json('DELETE')),
};

/** Full-page navigations for OAuth flows (they must leave the SPA). */
export const oauthUrls = {
  google: '/api/auth/google',
  slack: '/api/slack/install',
};
