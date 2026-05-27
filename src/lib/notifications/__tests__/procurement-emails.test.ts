/**
 * Unit tests for procurement email helpers. We mock the transport so the
 * tests are deterministic and don't depend on RESEND_API_KEY.
 */
jest.mock("../email", () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { sendNotificationEmail } from "../email";
import {
  getPublicBaseUrl,
  sendBidLoser,
  sendBidWinner,
  sendRfqInvite,
  sendRfqReminder,
} from "../procurement-emails";

const send = sendNotificationEmail as jest.MockedFunction<typeof sendNotificationEmail>;

describe("procurement-emails", () => {
  beforeEach(() => send.mockClear());

  it("sendRfqInvite includes RFQ number, deadline and supplier name", async () => {
    const deadline = new Date("2026-06-15T10:00:00Z");
    await sendRfqInvite({
      to: "supplier@example.com",
      supplierName: "Acme",
      rfqNumber: "RFQ-2026-0042",
      deadline,
      publicUrl: "https://example.com/public/rfq/abc",
    });
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe("supplier@example.com");
    expect(arg.subject).toContain("RFQ-2026-0042");
    expect(arg.body).toContain("Acme");
    expect(arg.body).toContain("RFQ-2026-0042");
    expect(arg.actionUrl).toBe("https://example.com/public/rfq/abc");
  });

  it("sendRfqReminder labels itself as a reminder", async () => {
    await sendRfqReminder({
      to: "s@x",
      supplierName: "S",
      rfqNumber: "R1",
      deadline: new Date(),
      publicUrl: "https://x/",
    });
    expect(send.mock.calls[0][0].subject.toLowerCase()).toContain("нагад");
  });

  it("sendBidWinner mentions the PO number", async () => {
    await sendBidWinner({
      to: "w@x",
      supplierName: "W",
      rfqNumber: "RFQ-1",
      poNumber: "PO-2026-0007",
      publicUrl: "https://x/",
    });
    expect(send.mock.calls[0][0].body).toContain("PO-2026-0007");
  });

  it("sendBidLoser thanks the participant without disclosing winner", async () => {
    await sendBidLoser({
      to: "l@x",
      supplierName: "L",
      rfqNumber: "RFQ-1",
      publicUrl: "https://x/",
    });
    const body = send.mock.calls[0][0].body;
    expect(body.toLowerCase()).toContain("дякуємо");
    expect(body).not.toMatch(/переможець:?\s+[A-ZА-ЯІЇЄ]/);
  });

  describe("getPublicBaseUrl", () => {
    const originalEnv = { ...process.env };
    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("prefers APP_BASE_URL and strips trailing slash", () => {
      process.env.APP_BASE_URL = "https://app.example.com/";
      process.env.NEXTAUTH_URL = "https://ignored.example.com";
      expect(getPublicBaseUrl()).toBe("https://app.example.com");
    });

    it("falls back to default if no env vars and no request", () => {
      delete process.env.APP_BASE_URL;
      delete process.env.NEXTAUTH_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(getPublicBaseUrl()).toBe("https://metrum-group.com.ua");
    });
  });
});
