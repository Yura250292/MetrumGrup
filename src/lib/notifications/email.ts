import { Resend } from "resend";
import { buildEmailHtml } from "./email-template";

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const from = process.env.EMAIL_FROM || "Metrum Group <noreply@metrum-group.com.ua>";

/**
 * Send a notification email. Fire-and-forget — never throws to callers.
 */
export async function sendNotificationEmail(opts: {
  to: string;
  subject: string;
  body: string;
  actionUrl: string;
  actionLabel?: string;
}): Promise<void> {
  const client = getResend();
  if (!client) {
    return;
  }

  await client.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: buildEmailHtml(opts),
  });
}

/**
 * Send a pre-rendered HTML email (used for rich task-assignment emails where
 * the template is built by the caller with custom sections).
 */
export async function sendCustomHtmlEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const client = getResend();
  if (!client) return;
  await client.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
