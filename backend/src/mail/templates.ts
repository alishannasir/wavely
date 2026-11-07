import { MailMessage } from './mail.service';

const BRAND = process.env.BRAND_NAME || 'Wavely';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function layout(title: string, bodyHtml: string, button?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#EEF0F6;font-family:Arial,Helvetica,sans-serif;color:#1C1A2E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;padding:28px">
<tr><td style="font-size:22px;font-weight:bold;color:#5B3CC4;padding-bottom:12px">${esc(BRAND)}</td></tr>
<tr><td style="font-size:20px;font-weight:bold;padding-bottom:12px">${esc(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;color:#3a3852">${bodyHtml}</td></tr>
${button ? `<tr><td style="padding:22px 0 8px"><a href="${esc(button.url)}" style="background:#1668D1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block">${esc(button.label)}</a></td></tr>
<tr><td style="font-size:12px;color:#5D5B72;word-break:break-all">Or paste this link into your browser:<br>${esc(button.url)}</td></tr>` : ''}
</table></td></tr></table></body></html>`;
}

export function verifyEmailMail(to: string, name: string | null, url: string): MailMessage {
  const hi = name ? `Hi ${name},` : 'Hi,';
  return {
    to,
    subject: `Confirm your email for ${BRAND}`,
    text: `${hi}\n\nConfirm your email address to unlock friends, messages and Premium:\n${url}\n\nThe link works for 24 hours. If you did not create an account, ignore this email.`,
    html: layout('Confirm your email', `<p>${esc(hi)}</p><p>Confirm your email address to unlock friends, messages and Premium. The link works for 24 hours.</p><p style="color:#5D5B72;font-size:13px">If you did not create an account, you can ignore this email.</p>`, { label: 'Confirm email', url }),
  };
}

export function resetPasswordMail(to: string, url: string): MailMessage {
  return {
    to,
    subject: `Reset your ${BRAND} password`,
    text: `We received a request to reset your password. Choose a new one here:\n${url}\n\nThe link works for 1 hour and can be used once. If this was not you, ignore this email: your password stays as it is.`,
    html: layout('Reset your password', '<p>We received a request to reset your password. The link works for 1 hour and can be used once.</p><p style="color:#5D5B72;font-size:13px">If this was not you, ignore this email: your password stays as it is.</p>', { label: 'Choose a new password', url }),
  };
}

export function changeEmailMail(to: string, url: string): MailMessage {
  return {
    to,
    subject: `Confirm your new ${BRAND} email`,
    text: `Confirm that this is your new email address for ${BRAND}:\n${url}\n\nThe link works for 1 hour. If you did not ask for this, ignore this email.`,
    html: layout('Confirm your new email', '<p>Confirm that this is your new email address. The link works for 1 hour.</p><p style="color:#5D5B72;font-size:13px">If you did not ask for this, ignore this email.</p>', { label: 'Confirm new email', url }),
  };
}

/** Security notices (no action needed): password changed, email change requested, account deleted. */
export function securityNoticeMail(to: string, subject: string, message: string): MailMessage {
  return {
    to,
    subject: `${BRAND}: ${subject}`,
    text: `${message}\n\nIf this was not you, reset your password right away and contact support.`,
    html: layout(subject, `<p>${esc(message)}</p><p style="color:#5D5B72;font-size:13px">If this was not you, reset your password right away and contact support.</p>`),
  };
}
