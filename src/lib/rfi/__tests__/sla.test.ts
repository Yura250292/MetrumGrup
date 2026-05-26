import { computeDueAt, hoursForPriority, DEFAULT_SLA_HOURS } from "../sla";
import type { FirmRFISLA } from "@prisma/client";

const customSLA: FirmRFISLA = {
  id: "x",
  firmId: "f",
  hoursLow: 80,
  hoursNormal: 50,
  hoursHigh: 20,
  hoursUrgent: 4,
  updatedAt: new Date(),
};

describe("rfi/sla", () => {
  test("hoursForPriority falls back to defaults when sla is null", () => {
    expect(hoursForPriority("LOW", null)).toBe(DEFAULT_SLA_HOURS.LOW);
    expect(hoursForPriority("NORMAL", null)).toBe(DEFAULT_SLA_HOURS.NORMAL);
    expect(hoursForPriority("HIGH", null)).toBe(DEFAULT_SLA_HOURS.HIGH);
    expect(hoursForPriority("URGENT", null)).toBe(DEFAULT_SLA_HOURS.URGENT);
  });

  test("hoursForPriority uses custom SLA when provided", () => {
    expect(hoursForPriority("LOW", customSLA)).toBe(80);
    expect(hoursForPriority("URGENT", customSLA)).toBe(4);
  });

  test("computeDueAt with URGENT 8h on Tue 10:00 lands at boundary 18:00 same day", () => {
    const start = new Date("2026-04-14T10:00:00+03:00"); // Tue
    const due = computeDueAt(start, "URGENT", null);
    expect(due.getTime()).toBe(new Date("2026-04-14T18:00:00+03:00").getTime());
  });

  test("computeDueAt with URGENT 4h custom on Tue 10:00 → Tue 14:00", () => {
    const start = new Date("2026-04-14T10:00:00+03:00");
    const due = computeDueAt(start, "URGENT", customSLA);
    expect(due.getTime()).toBe(new Date("2026-04-14T14:00:00+03:00").getTime());
  });
});
