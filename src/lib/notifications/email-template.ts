import { marked } from "marked";

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

const PRIORITY_COLORS: Record<string, { bg: string; label: string }> = {
  LOW: { bg: "#94a3b8", label: "Низький" },
  NORMAL: { bg: "#2563EB", label: "Нормальний" },
  HIGH: { bg: "#f59e0b", label: "Високий" },
  URGENT: { bg: "#ef4444", label: "Терміновий" },
};

function formatDueLabel(dueDate: Date | null | undefined): string | null {
  if (!dueDate) return null;
  const now = new Date();
  const d = new Date(dueDate);
  const dateStr = d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0)
    return `<span style="color:#ef4444;">${dateStr} ⚠ прострочено на ${Math.abs(diffDays)} д.</span>`;
  if (diffDays === 0) return `${dateStr} (сьогодні)`;
  return `${dateStr} (${diffDays} д.)`;
}

function sanitizeMarkdownHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function markdownToHtml(md: string): string {
  try {
    const html = marked.parse(md, { async: false }) as string;
    return sanitizeMarkdownHtml(html);
  } catch {
    return `<p>${escapeHtml(md)}</p>`;
  }
}

/**
 * Rich email for TASK_ASSIGNED: includes the full technical specification
 * (Markdown rendered to HTML), deadline with days-remaining, priority badge,
 * assigner, project, and a deep-link CTA.
 */
export function buildTaskAssignedEmailHtml(opts: {
  subject: string;
  taskTitle: string;
  projectTitle?: string | null;
  assignerName?: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueDate?: Date | null;
  specificationMarkdown?: string | null;
  actionUrl: string;
  actionLabel?: string;
}): string {
  const priorityInfo = PRIORITY_COLORS[opts.priority] ?? PRIORITY_COLORS.NORMAL!;
  const dueLabel = formatDueLabel(opts.dueDate);
  const specHtml = opts.specificationMarkdown
    ? markdownToHtml(opts.specificationMarkdown)
    : "";
  const label = opts.actionLabel || "Відкрити задачу";
  const baseUrl = opts.actionUrl.split("/admin")[0] || "";

  const metaRows: string[] = [];
  if (opts.assignerName) {
    metaRows.push(
      `<tr><td style="padding:4px 0;color:#64748b;font-size:13px;">👤 Призначив: <strong style="color:#1a1a2e;">${escapeHtml(opts.assignerName)}</strong></td></tr>`,
    );
  }
  if (opts.projectTitle) {
    metaRows.push(
      `<tr><td style="padding:4px 0;color:#64748b;font-size:13px;">📁 Проєкт: <strong style="color:#1a1a2e;">${escapeHtml(opts.projectTitle)}</strong></td></tr>`,
    );
  }
  metaRows.push(
    `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">🏷 Пріоритет: <span style="display:inline-block;padding:2px 10px;background:${priorityInfo.bg};color:#fff;border-radius:4px;font-size:12px;font-weight:600;">${escapeHtml(priorityInfo.label)}</span></td></tr>`,
  );
  if (dueLabel) {
    metaRows.push(
      `<tr><td style="padding:4px 0;color:#64748b;font-size:13px;">⏰ Дедлайн: <strong style="color:#1a1a2e;">${dueLabel}</strong></td></tr>`,
    );
  }

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
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#2563EB,#7C3AED);padding:20px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.5px;">
                Metrum Group • Нова задача
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 6px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Вас призначено на задачу</p>
              <h2 style="margin:0 0 18px;color:#1a1a2e;font-size:20px;font-weight:700;line-height:1.3;">
                ${escapeHtml(opts.taskTitle)}
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
                ${metaRows.join("")}
              </table>
              ${
                specHtml
                  ? `<div style="border-top:1px solid #e2e8f0;padding-top:18px;">
                      <h3 style="margin:0 0 10px;color:#1a1a2e;font-size:15px;font-weight:700;">Технічне завдання</h3>
                      <div style="color:#334155;font-size:14px;line-height:1.6;">
                        ${specHtml}
                      </div>
                    </div>`
                  : ""
              }
              <div style="margin-top:24px;">
                <a href="${escapeHtml(opts.actionUrl)}"
                   style="display:inline-block;padding:12px 24px;background:#2563EB;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
                  ${escapeHtml(label)}
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                Це автоматичне сповіщення від Metrum Group.<br>
                Ви можете змінити налаштування сповіщень у <a href="${escapeHtml(baseUrl)}/admin-v2/profile" style="color:#2563EB;text-decoration:none;">профілі</a>.
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
