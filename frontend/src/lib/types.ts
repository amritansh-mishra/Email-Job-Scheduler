export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type Tab = 'scheduled' | 'sent';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Sender {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface EmailListItem {
  id: string;
  toEmail: string;
  subject: string;
  preview: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  starred: boolean;
  senderEmail: string;
}

export interface EmailList {
  items: EmailListItem[];
  total: number;
  page: number;
  limit: number;
  source: 'elasticsearch' | 'postgres';
}

export interface EmailDetail extends Omit<EmailListItem, 'preview'> {
  bodyHtml: string;
  previewUrl: string | null;
  error: string | null;
  attempts: number;
  senderName: string;
}

export interface EmailCounts {
  scheduled: number;
  sent: number;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channel: string | null;
}

export interface CreateCampaignInput {
  senderId: string;
  subject: string;
  bodyHtml: string;
  recipients: string[];
  startAt: string;
  delayBetweenSeconds: number;
  hourlyLimit: number;
}

export interface CreateCampaignResult {
  campaignId: string;
  scheduled: number;
  firstSendAt: string;
}
