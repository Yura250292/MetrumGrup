"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

export type ChartKind = "bar" | "line" | "pie";

export interface ChartConfig {
  title?: string;
  data: Array<Record<string, string | number>>;
  /** For bar/pie: shorter format. For line: explicit. */
  xKey?: string; // bar/line — name field
  valueKey?: string; // bar/pie default value field
  valueLabel?: string; // unit label (e.g. "грн")
  series?: Array<{ key: string; label: string; color?: string }>; // line/multi-bar
}

const DEFAULT_COLORS = [
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#60a5fa",
  "#f472b6",
  "#22d3ee",
  "#fb923c",
];

const formatNumber = (n: number, label?: string): string => {
  const formatted =
    Math.abs(n) >= 1_000_000
      ? `${(n / 1_000_000).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} млн`
      : Math.abs(n) >= 1_000
        ? `${(n / 1_000).toLocaleString("uk-UA", { maximumFractionDigits: 1 })} тис`
        : n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
  return label ? `${formatted} ${label}` : formatted;
};

export function ChartBlock({ kind, config }: { kind: ChartKind; config: ChartConfig }) {
  if (!config.data || config.data.length === 0) {
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-xs text-zinc-500 my-2">
        (графік без даних)
      </div>
    );
  }

  const xKey = config.xKey ?? "name";
  const valueKey = config.valueKey ?? "value";
  const series =
    config.series && config.series.length > 0
      ? config.series
      : [{ key: valueKey, label: config.valueLabel ?? "Значення", color: DEFAULT_COLORS[0] }];

  return (
    <div className="rounded-2xl bg-zinc-900/60 border border-white/10 backdrop-blur-md p-3 my-3">
      {config.title && (
        <div className="text-xs font-semibold text-zinc-300 mb-2 px-1">{config.title}</div>
      )}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={config.data} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey={xKey}
                tick={{ fill: "#a1a1aa", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#a1a1aa", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatNumber(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(24, 24, 27, 0.95)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "#f4f4f5",
                }}
                formatter={(v) => formatNumber(Number(v), config.valueLabel)}
              />
              {series.length > 1 && (
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
              )}
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  radius={[6, 6, 0, 0]}
                  name={s.label}
                />
              ))}
            </BarChart>
          ) : kind === "line" ? (
            <LineChart data={config.data} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey={xKey}
                tick={{ fill: "#a1a1aa", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#a1a1aa", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatNumber(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(24, 24, 27, 0.95)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "#f4f4f5",
                }}
                formatter={(v) => formatNumber(Number(v), config.valueLabel)}
              />
              {series.length > 1 && (
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
              )}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name={s.label}
                />
              ))}
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={config.data}
                dataKey={valueKey}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={70}
                innerRadius={32}
                paddingAngle={2}
                label={(entry) =>
                  `${(entry as { name: string }).name}: ${formatNumber(Number((entry as { value: number }).value))}`
                }
                labelLine={false}
              >
                {config.data.map((_, i) => (
                  <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(24, 24, 27, 0.95)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "#f4f4f5",
                }}
                formatter={(v) => formatNumber(Number(v), config.valueLabel)}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function parseChartConfig(raw: string): ChartConfig | null {
  try {
    const parsed = JSON.parse(raw) as ChartConfig;
    if (!parsed || !Array.isArray(parsed.data)) return null;
    return parsed;
  } catch {
    return null;
  }
}
