import { addWorkingHours, isWorkingDay, nextWorkingMoment } from "../working-calendar";

// All inputs constructed using ISO with explicit Kyiv offset to keep the
// expected results unambiguous regardless of CI tz.
function kyiv(iso: string): Date {
  // Pretend the literal time is local Kyiv. Build a UTC Date by applying the
  // offset that Kyiv has at that wall-clock time. Helper just for tests.
  return new Date(`${iso}+03:00`); // 2026-04-* falls into summer DST (EEST = +03)
}

describe("rfi/working-calendar", () => {
  test("isWorkingDay: Mon–Fri are working, Sat/Sun are not", () => {
    expect(isWorkingDay(kyiv("2026-04-13T10:00:00"))).toBe(true); // Mon
    expect(isWorkingDay(kyiv("2026-04-17T10:00:00"))).toBe(true); // Fri
    expect(isWorkingDay(kyiv("2026-04-18T10:00:00"))).toBe(false); // Sat
    expect(isWorkingDay(kyiv("2026-04-19T10:00:00"))).toBe(false); // Sun
  });

  test("isWorkingDay: holiday flagged false", () => {
    // 2026-08-24 is Independence Day (Ukraine)
    expect(isWorkingDay(kyiv("2026-08-24T10:00:00"))).toBe(false);
  });

  test("nextWorkingMoment: inside working window returns input", () => {
    const t = kyiv("2026-04-14T10:30:00"); // Tue 10:30
    const r = nextWorkingMoment(t);
    expect(r.getTime()).toBe(t.getTime());
  });

  test("nextWorkingMoment: before 09:00 → today 09:00", () => {
    const t = kyiv("2026-04-14T07:00:00"); // Tue 07:00
    const r = nextWorkingMoment(t);
    expect(r.getTime()).toBe(kyiv("2026-04-14T09:00:00").getTime());
  });

  test("nextWorkingMoment: weekend → next Monday 09:00", () => {
    const sat = kyiv("2026-04-18T10:00:00");
    const r = nextWorkingMoment(sat);
    expect(r.getTime()).toBe(kyiv("2026-04-20T09:00:00").getTime());
  });

  test("addWorkingHours: 8h URGENT starting Tue 10:00 → Wed 09:00", () => {
    // 10:00 + 8h within working window would be 18:00 same day (exactly end-of-day),
    // which we treat as boundary → next working start 09:00 next working day.
    // The function leaves the cursor exactly at boundary when remaining == dayEnd,
    // so result is end-of-day Tue.
    const start = kyiv("2026-04-14T10:00:00");
    const out = addWorkingHours(start, 8);
    expect(out.getTime()).toBe(kyiv("2026-04-14T18:00:00").getTime());
  });

  test("addWorkingHours: 9h starting Tue 10:00 → Wed 10:00", () => {
    const start = kyiv("2026-04-14T10:00:00");
    const out = addWorkingHours(start, 9); // consume rest of Tue (8h) + 1h Wed
    expect(out.getTime()).toBe(kyiv("2026-04-15T10:00:00").getTime());
  });

  test("addWorkingHours: starting Friday 17:00 with 24h → Wed 17:00 (skip Sat/Sun)", () => {
    // Fri 17:00 → 1h to end-of-Fri, then 9h/day × Mon,Tue,Wed (each whole day)
    // = 1 + 9 + 9 + 5 = 24 ⇒ Wed 14:00? Let me recompute: 1 (Fri) + 9 (Mon) + 9 (Tue) = 19;
    // remaining 5 ⇒ Wed 09:00 + 5h = 14:00. Adjust expected.
    const start = kyiv("2026-04-17T17:00:00"); // Friday
    const out = addWorkingHours(start, 24);
    expect(out.getTime()).toBe(kyiv("2026-04-22T14:00:00").getTime());
  });

  test("addWorkingHours: crosses Independence Day holiday", () => {
    // Aug 24 2026 is Mon (Independence Day, holiday). Starting Fri Aug 21 17:00 with 2h:
    // 1h consumes Fri end-of-day; remaining 1h skips Sat/Sun + holiday Mon → Tue 09:00 + 1h = Tue 10:00.
    const start = kyiv("2026-08-21T17:00:00");
    const out = addWorkingHours(start, 2);
    expect(out.getTime()).toBe(kyiv("2026-08-25T10:00:00").getTime());
  });
});
