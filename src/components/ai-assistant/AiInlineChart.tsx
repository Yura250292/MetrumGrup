"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const COLORS = ["#3B5BFF", "#7C5CFF", "#16A34A", "#EA580C", "#0D9488", "#D97706", "#E11D48", "#4F46E5"];

type ChartData = {
  type: "bar" | "pie";
  title?: string;
  data: Array<{ name: string; value: number; [key: string]: unknown }>;
};

export function AiInlineChart({ chartJson }: { chartJson: string }) {
  const chart = useMemo<ChartData | null>(() => {
    try {
      return JSON.parse(chartJson);
    } catch {
      return null;
    }
  }, [chartJson]);

  if (!chart || !chart.data?.length) return null;

  return (
    <div className="my-2 rounded-xl p-3" style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}>
      {chart.title && (
        <p className="mb-2 text-xs font-semibold" style={{ color: T.textPrimary }}>{chart.title}</p>
      )}
      <div className="h-[180px] w-full">
        {chart.type === "bar" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart.data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: T.textMuted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: T.textMuted }} axisLine={false} tickLine={false} width={50} />
              <Tooltip
                contentStyle={{
                  backgroundColor: T.panel,
                  border: `1px solid ${T.borderSoft}`,
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chart.data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chart.data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
                style={{ fontSize: 10 }}
              >
                {chart.data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: T.panel,
                  border: `1px solid ${T.borderSoft}`,
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/**
 * Extract ```chart blocks from markdown and split into text + chart segments.
 */
export function parseChartBlocks(content: string): Array<{ type: "text" | "chart"; content: string }> {
  const parts: Array<{ type: "text" | "chart"; content: string }> = [];
  const regex = /```chart\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "chart", content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", content }];
}
