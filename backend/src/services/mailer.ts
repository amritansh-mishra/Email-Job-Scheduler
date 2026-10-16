import nodemailer, { type Transporter } from 'nodemailer';
import type { Sender } from '../db/schema.js';

const transports = new Map<string, Transporter>();

function transportFor(sender: Sender) {
  let t = transports.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpSecure,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
      pool: true,
      maxConnections: 2,
    });
    transports.set(sender.id, t);
  }
  return t;
}

export async function sendMail(sender: Sender, msg: { emailId: string; to: string; subject: string; html: string }) {
  const info = await transportFor(sender).sendMail({
    from: { name: sender.name, address: sender.email },
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    // Deterministic Message-ID: a duplicate send would be recognisable as such downstream.
    messageId: `<${msg.emailId}@reachinbox.local>`,
  });
  return { messageId: info.messageId as string, previewUrl: nodemailer.getTestMessageUrl(info) || null };
}

/** Creates a fresh Ethereal (fake SMTP) account to use as a sender. */
export async function createEtherealAccount() {
  const acc = await nodemailer.createTestAccount();
  return {
    email: acc.user,
    smtpHost: acc.smtp.host,
    smtpPort: acc.smtp.port,
    smtpSecure: acc.smtp.secure,
    smtpUser: acc.user,
    smtpPass: acc.pass,
  };
}
