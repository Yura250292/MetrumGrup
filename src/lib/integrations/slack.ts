/**
 * Slack integration — simplified webhook-based notifier.
 *
 * Full OAuth flow requires a Slack app (client_id/secret + redirect URL).
 * For MVP we support the simpler Incoming Webhook URL approach: user creates
 * a webhook in their Slack workspace and stores the URL per-project or
 * per-user via UserIntegration.
 *
 * Usage:
 *   await postToSlack(webhookUrl, { text: "Task Foo assigned to @you" });
 */

export async function postToSlack(
  webhookUrl: string,
  payload: {
    text: string;
    attachments?: {
      color?: string;
      title?: string;
      title_link?: string;
      text?: string;
      fields?: { title: string; value: string; short?: boolean }[];
    }[];
  },
): Promise<boolean> {
  if (!webhookUrl || !/^https:\/\/hooks\.slack\.com\//.test(webhookUrl)) {
    console.warn("[slack] invalid webhook URL");
    return false;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch (err) {
    console.error("[slack] post failed", err);
    return false;
  }
}

export function buildTaskAssignedMessage(opts: {
  taskTitle: string;
  taskUrl: string;
  projectTitle: string;
  assigneeName: string;
  priority: string;
}) {
  const colorMap: Record<string, string> = {
    LOW: "#64748b",
    NORMAL: "#3b82f6",
    HIGH: "#f59e0b",
    URGENT: "#ef4444",
  };
  return {
    text: `📌 Нова задача для ${opts.assigneeName}`,
    attachments: [
      {
        color: colorMap[opts.priority] ?? "#3b82f6",
        title: opts.taskTitle,
        title_link: opts.taskUrl,
        fields: [
          { title: "Проєкт", value: opts.projectTitle, short: true },
          { title: "Пріоритет", value: opts.priority, short: true },
        ],
      },
    ],
  };
}
