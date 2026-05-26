import { composeBidScore } from "../pricing";

describe("procurement/pricing.composeBidScore", () => {
  test("single bid → max score", () => {
    const s = composeBidScore({
      priceRank: 1,
      deliveryRank: 1,
      rating: 5,
      totalBids: 1,
    });
    expect(s.price).toBe(100);
    expect(s.delivery).toBe(100);
    expect(s.rating).toBe(100);
    expect(s.score).toBe(100);
  });

  test("three bids: rank 1/2/3 → 100 / 50 / 0", () => {
    const a = composeBidScore({
      priceRank: 1,
      deliveryRank: 1,
      rating: 5,
      totalBids: 3,
    });
    const b = composeBidScore({
      priceRank: 2,
      deliveryRank: 2,
      rating: 5,
      totalBids: 3,
    });
    const c = composeBidScore({
      priceRank: 3,
      deliveryRank: 3,
      rating: 5,
      totalBids: 3,
    });
    expect(a.price).toBe(100);
    expect(b.price).toBe(50);
    expect(c.price).toBe(0);
    expect(a.score).toBeGreaterThan(b.score);
    expect(b.score).toBeGreaterThan(c.score);
  });

  test("null rating → 3.0 neutral (60 points)", () => {
    const s = composeBidScore({
      priceRank: 1,
      deliveryRank: 1,
      rating: null,
      totalBids: 1,
    });
    expect(s.rating).toBe(60); // 3.0 / 5 * 100
  });

  test("weights: ціна важить 0.6, доставка і рейтинг по 0.2", () => {
    // 3 bids — найдешевший і найшвидший, але рейтинг 0.
    const fastCheap = composeBidScore({
      priceRank: 1,
      deliveryRank: 1,
      rating: 0,
      totalBids: 3,
    });
    // 3 bids — найдорожчий, повільний, але рейтинг 5.
    const slowExpensive = composeBidScore({
      priceRank: 3,
      deliveryRank: 3,
      rating: 5,
      totalBids: 3,
    });
    // fastCheap: 0.6*100 + 0.2*100 + 0.2*0 = 80
    // slowExpensive: 0.6*0 + 0.2*0 + 0.2*100 = 20
    expect(fastCheap.score).toBe(80);
    expect(slowExpensive.score).toBe(20);
  });

  test("rank поза [1..totalBids] клемпається", () => {
    const s = composeBidScore({
      priceRank: 5,
      deliveryRank: 0,
      rating: 5,
      totalBids: 3,
    });
    // priceRank=5 clamps to 3, deliveryRank=0 clamps to 1
    expect(s.price).toBe(0);
    expect(s.delivery).toBe(100);
  });
});
