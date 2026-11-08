import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type MailTransport = 'console' | 'smtp' | 'resend';

export function mailTransport(): MailTransport {
  const t = (process.env.MAIL_TRANSPORT ?? 'console').toLowerCase();
  return t === 'smtp' || t === 'resend' ? t : 'console';
}

/**
 * Whether real email delivery is configured. Features that depend on people receiving mail
 * (mandatory email verification) only switch on when it is.
 */
export function isMailDeliveryConfigured(): boolean {
  return mailTransport() !== 'console';
}

/**
 * Sends email. MAIL_TRANSPORT picks how:
 *  - console (default): prints the message to the API log. For local development only.
 *  - smtp: any SMTP server (Mailpit locally; Resend, Postmark, Amazon SES, Mailgun... all offer SMTP).
 *  - resend: Resend's HTTP API (RESEND_API_KEY).
 * MAIL_FROM is the sender, e.g. "Wavely <no-reply@yourdomain.com>" (the domain must be verified at the provider).
 */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private smtp?: nodemailer.Transporter;

  private from(): string {
    return process.env.MAIL_FROM || 'Wavely <no-reply@localhost>';
  }

  private smtpTransport(): nodemailer.Transporter {
    if (!this.smtp) {
      const host = process.env.MAIL_SMTP_HOST || 'localhost';
      const port = parseInt(process.env.MAIL_SMTP_PORT || '587', 10);
      this.smtp = nodemailer.createTransport({
        host,
        port,
        secure: process.env.MAIL_SMTP_SECURE === 'true' || port === 465,
        auth: process.env.MAIL_SMTP_USER ? { user: process.env.MAIL_SMTP_USER, pass: process.env.MAIL_SMTP_PASS ?? '' } : undefined,
      });
    }
    return this.smtp;
  }

  /** Resolves when the provider accepted the message. Throws if it did not. */
  async send(msg: MailMessage): Promise<void> {
    switch (mailTransport()) {
      case 'smtp':
        await this.smtpTransport().sendMail({ from: this.from(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
        return;
      case 'resend': {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RESEND_API_KEY ?? ''}` },
          body: JSON.stringify({ from: this.from(), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
        });
        if (!res.ok) throw new Error(`Resend rejected the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
        return;
      }
      default:
        // The text holds working verification / reset links. In production they must not end up in the logs, unless
        // someone opted in on purpose (for example a staging site that has no mail provider).
        if (process.env.NODE_ENV === 'production' && process.env.MAIL_CONSOLE_LOG_BODY !== 'true') {
          this.log.warn(`[mail:console] to=${msg.to} subject="${msg.subject}" (body hidden; set MAIL_CONSOLE_LOG_BODY=true to print it, or configure MAIL_TRANSPORT)`);
        } else {
          this.log.log(`[mail:console] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
        }
    }
  }

  /** For flows where failing to send must not break the request (the user can ask again). */
  async trySend(msg: MailMessage): Promise<boolean> {
    try {
      await this.send(msg);
      return true;
    } catch (err) {
      this.log.error(`Could not send "${msg.subject}": ${(err as Error).message}`);
      return false;
    }
  }
}
