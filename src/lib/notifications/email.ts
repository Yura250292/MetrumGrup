import { Resend } from "resend";
import { buildEmailHtml } from "./email-template";

const resend = new Resend(process.env.RESEND_API_KEY || undefined);
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
  if (!process.env.RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not configured, skipping email");
    return;
  }

  await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: buildEmailHtml(opts),
  });
}
