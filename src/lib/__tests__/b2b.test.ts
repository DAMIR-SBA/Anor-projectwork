import { describe, expect, it } from "vitest";
import { addBankDays, BANK_ACCOUNT_RE, formatAccount, MFO_RE, quoteNumber, quotePriceFor, quoteState, TAX_ID_RE, vatIncluded } from "../b2b";
import { computeCart, type CartLine } from "../pricing";

describe("B2B requisites", () => {
  it("validates STIR, account and MFO formats", () => {
    expect(TAX_ID_RE.test("305123456")).toBe(true);
    expect(TAX_ID_RE.test("105123456")).toBe(false);
    expect(TAX_ID_RE.test("30512345")).toBe(false);
    expect(BANK_ACCOUNT_RE.test("20208000100200300401")).toBe(true);
    expect(BANK_ACCOUNT_RE.test("2020800010020030040")).toBe(false);
    expect(MFO_RE.test("00401")).toBe(true);
    expect(formatAccount("20208000100200300401")).toBe("2020 8000 1002 0030 0401");
  });
  it("extracts 12% VAT from an inclusive amount", () => {
    expect(vatIncluded(112_000)).toBe(12_000);
    expect(vatIncluded(720_000)).toBe(77_143);
  });
  it("counts banking days over weekends", () => {
    // Thu 2026-10-15 + 3 banking days = Tue 2026-10-20
    expect(addBankDays(new Date("2026-10-15T10:00:00Z"), 3).toISOString()).toBe("2026-10-20T10:00:00.000Z");
    // Fri + 1 = Mon
    expect(addBankDays(new Date("2026-10-16T10:00:00Z"), 1).toISOString()).toBe("2026-10-19T10:00:00.000Z");
  });
  it("makes unambiguous quote numbers", () => {
    expect(quoteNumber(() => 0)).toBe("Q-222222");
    expect(quoteNumber()).toMatch(/^Q-[2-9A-HJ-NP-Z]{6}$/);
  });
});

describe("quotes", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const base = { status: "ACCEPTED", userId: "u1", quotedPrice: 14_400, validUntil: new Date("2026-10-20T00:00:00Z"), createdAt: new Date("2026-10-14T00:00:00Z") };
  it("reads lapsed prices and unanswered requests as expired", () => {
    expect(quoteState(base, now)).toBe("ACCEPTED");
    expect(quoteState({ ...base, validUntil: new Date("2026-10-16T11:00:00Z") }, now)).toBe("EXPIRED");
    expect(quoteState({ ...base, status: "OPEN", validUntil: null, createdAt: new Date("2026-10-01T00:00:00Z") }, now)).toBe("EXPIRED");
    expect(quoteState({ ...base, status: "ORDERED" }, now)).toBe("ORDERED");
  });
  it("gives the negotiated price only to its owner while valid", () => {
    expect(quotePriceFor(base, "u1", now)).toBe(14_400);
    expect(quotePriceFor(base, "u2", now)).toBeNull();
    expect(quotePriceFor({ ...base, status: "QUOTED" }, "u1", now)).toBeNull();
    expect(quotePriceFor(base, "u1", new Date("2026-10-21T00:00:00Z"))).toBeNull();
  });
  it("keeps negotiated lines out of tiers, promotions and coupons", () => {
    const line: CartLine = { variantId: "v1", productId: "p1", shopId: "s1", categoryIds: ["c1"], unitPrice: 14_400, oldPrice: 18_000, quantity: 50, wholesaleTiers: [{ minQty: 20, price: 13_000 }], negotiated: true };
    const r = computeCart({
      lines: [line],
      isBusiness: true,
      promotions: [{ id: "x", type: "MULTI_BUY", discountPercent: 10, minQty: 2, productIds: ["p1"] }],
      coupon: { code: "C", type: "PERCENT", value: 10, minCartTotal: 0, firstOrderOnly: false, usedCount: 0, perUserLimit: 5, isActive: true },
      couponCtx: { now: new Date(), isFirstOrder: true, userUses: 0 },
    });
    expect(r.subtotal).toBe(720_000);
    expect(r.promoDiscount).toBe(0);
    expect(r.couponDiscount).toBe(0);
    expect(r.couponError).toBe("notApplicable");
    const plain = computeCart({ lines: [{ ...line, negotiated: false }], isBusiness: true });
    expect(plain.subtotal).toBe(650_000);
  });
});
