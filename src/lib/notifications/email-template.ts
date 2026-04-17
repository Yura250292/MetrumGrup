/**
 * Generates a simple, inline-CSS HTML email for notifications.
 */
export function buildEmailHtml(opts: {
  subject: string;
  body: string;
  actionUrl: string;
  actionLabel?: string;
}): string {
  const label = opts.actionLabel || "Переглянути";

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563EB,#7C3AED);padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">
                Metrum Group
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:16px;font-weight:600;">
                ${escapeHtml(opts.subject)}
              </h2>
              ${opts.body ? `<p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.6;">${escapeHtml(opts.body)}</p>` : ""}
              <a href="${escapeHtml(opts.actionUrl)}"
                 style="display:inline-block;padding:12px 24px;background:#2563EB;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
                ${escapeHtml(label)}
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                Це автоматичне сповіщення від Metrum Group.<br>
                Ви можете змінити налаштування сповіщень у <a href="${escapeHtml(opts.actionUrl.split("/admin")[0] || "")}/admin-v2/profile" style="color:#2563EB;text-decoration:none;">профілі</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
