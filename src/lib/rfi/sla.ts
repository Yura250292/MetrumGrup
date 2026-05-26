import type { RFIPriority, FirmRFISLA } from "@prisma/client";
import { addWorkingHours } from "./working-calendar";

export const DEFAULT_SLA_HOURS: Record<RFIPriority, number> = {
  LOW: 72,
  NORMAL: 48,
  HIGH: 24,
  URGENT: 8,
};

export function hoursForPriority(priority: RFIPriority, sla: FirmRFISLA | null): number {
  if (!sla) return DEFAULT_SLA_HOURS[priority];
  switch (priority) {
    case "LOW":
      return sla.hoursLow;
    case "NORMAL":
      return sla.hoursNormal;
    case "HIGH":
      return sla.hoursHigh;
    case "URGENT":
      return sla.hoursUrgent;
  }
}

/// Computes due deadline in working hours (Mon–Fri 09:00–18:00 Kyiv).
/// If `sla` is null — falls back to defaults (72/48/24/8).
export function computeDueAt(askedAt: Date, priority: RFIPriority, sla: FirmRFISLA | null): Date {
  const hours = hoursForPriority(priority, sla);
  return addWorkingHours(askedAt, hours);
}
