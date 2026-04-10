// Small formatting helpers for v2

export function formatUAH(amount: number | undefined | null): string {
  if (amount == null || Number.isNaN(amount)) return "₴ 0";
  return `₴ ${Math.round(amount).toLocaleString("uk-UA").replace(/,/g, " ")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function formatM2(area: string | number | undefined): string {
  if (area == null || area === "") return "—";
  return `${area} м²`;
}
