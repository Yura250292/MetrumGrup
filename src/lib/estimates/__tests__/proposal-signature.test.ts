import {
  createRoundSignature,
  verifyRoundSignature,
  type NegotiationRoundSignaturePayload,
} from "../proposal-signature";

const basePayload: NegotiationRoundSignaturePayload = {
  itemProposalId: "ip-123",
  roundNumber: 2,
  actorSide: "client",
  action: "COUNTER",
  proposedQuantity: "10.500",
  proposedUnitPrice: "250.00",
  proposedAmount: "2625.00",
  comment: "дешевше",
  timestamp: "2026-05-29T10:00:00.000Z",
  ipAddress: "1.2.3.4",
  userAgent: "Mozilla/5.0",
};

describe("createRoundSignature / verifyRoundSignature", () => {
  it("deterministic — однаковий payload = однаковий hash", () => {
    expect(createRoundSignature(basePayload)).toBe(
      createRoundSignature(basePayload),
    );
  });

  it("verify повертає true для валідного підпису", () => {
    const hash = createRoundSignature(basePayload);
    expect(verifyRoundSignature(hash, basePayload)).toBe(true);
  });

  it("зміна хоч одного поля → verify=false (детект підробки)", () => {
    const hash = createRoundSignature(basePayload);
    const tampered: NegotiationRoundSignaturePayload = {
      ...basePayload,
      proposedUnitPrice: "200.00", // знизили ціну
    };
    expect(verifyRoundSignature(hash, tampered)).toBe(false);
  });

  it("порядок ключів у JSON.stringify не впливає", () => {
    const reordered: NegotiationRoundSignaturePayload = {
      userAgent: basePayload.userAgent,
      ipAddress: basePayload.ipAddress,
      timestamp: basePayload.timestamp,
      comment: basePayload.comment,
      proposedAmount: basePayload.proposedAmount,
      proposedUnitPrice: basePayload.proposedUnitPrice,
      proposedQuantity: basePayload.proposedQuantity,
      action: basePayload.action,
      actorSide: basePayload.actorSide,
      roundNumber: basePayload.roundNumber,
      itemProposalId: basePayload.itemProposalId,
    };
    expect(createRoundSignature(reordered)).toBe(createRoundSignature(basePayload));
  });

  it("null vs undefined для optional полів — однакова канонічна форма", () => {
    const payload: NegotiationRoundSignaturePayload = {
      ...basePayload,
      ipAddress: null,
      userAgent: null,
    };
    const hash = createRoundSignature(payload);
    expect(verifyRoundSignature(hash, payload)).toBe(true);
  });
});
