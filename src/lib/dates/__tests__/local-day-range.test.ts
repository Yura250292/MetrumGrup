import { startOfLocalDayISO, endOfLocalDayISO } from "../local-day-range";

describe("local-day-range", () => {
  it("interprets YYYY-MM-DD as local midnight (not UTC)", () => {
    // The host's local TZ in Jest is whatever the OS reports. The contract
    // we verify is: parsing "YYYY-MM-DD" + local time yields a moment whose
    // local-clock representation is 00:00 on that day.
    const iso = startOfLocalDayISO("2025-05-01");
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(4); // May
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it("end of day is 23:59:59.999 local", () => {
    const iso = endOfLocalDayISO("2025-05-01");
    const d = new Date(iso);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
  });

  it("rejects malformed input", () => {
    expect(() => startOfLocalDayISO("2025/05/01")).toThrow();
    expect(() => endOfLocalDayISO("not a date")).toThrow();
  });
});
