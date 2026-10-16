import { describe, expect, it } from "vitest";
import { adCharge, adMetrics, bearerToken, fulfillmentScore, gradeQuiz, isPrivateIp, maskAccount, pricePosition, proEligibility, validateWebhookUrl, nextPayoutDate, parseCsv, payoutNet, payoutWeek, productNeedsReview, requiredDocuments, slugify, toCsv, unitEconomics, validateBankAccount, validateImport, validateMfo, validateTaxId } from "../seller";

describe("legal and bank validation", () => {
  it("checks STIR / PINFL by legal type", () => {
    expect(validateTaxId("LLC", "305123456")).toBe(true);
    expect(validateTaxId("LLC", "512345678")).toBe(false);
    expect(validateTaxId("INDIVIDUAL_ENTREPRENEUR", "512345678")).toBe(true);
    expect(validateTaxId("SELF_EMPLOYED", "31234567890123")).toBe(true);
    expect(validateTaxId("SELF_EMPLOYED", "305123456")).toBe(false);
  });
  it("checks bank account and MFO and masks the account", () => {
    expect(validateBankAccount("2020 8000 1234 5678 9012")).toBe(true);
    expect(validateBankAccount("12345")).toBe(false);
    expect(validateMfo("00014")).toBe(true);
    expect(maskAccount("20208000123456789012")).toBe("•••• 9012");
  });
  it("requires documents per legal type", () => {
    expect(requiredDocuments("LLC")).toEqual(["registration_certificate", "director_passport"]);
    expect(requiredDocuments("SELF_EMPLOYED")).toContain("self_employed_certificate");
  });
  it("slugifies Latin and Cyrillic names", () => {
    expect(slugify("Moda Bazar")).toBe("moda-bazar");
    expect(slugify("Ҳунарманд Устахонаси")).toBe("hunarmand-ustaxonasi");
    expect(slugify("O‘zbek choyi")).toBe("ozbek-choyi");
  });
});

describe("unit economics", () => {
  it("subtracts commission, logistics, ads and expected returns", () => {
    const e = unitEconomics({ price: 100_000, commissionRate: 0.12, logisticsFee: 8_000, adSpendPerUnit: 2_000, returnRate: 0.05, costPrice: 50_000 });
    expect(e.commission).toBe(12_000);
    expect(e.returnsCost).toBe(800);
    expect(e.payout).toBe(77_200);
    expect(e.profit).toBe(27_200);
    expect(e.margin).toBeCloseTo(0.272);
  });
  it("leaves profit unknown without a cost price", () => {
    expect(unitEconomics({ price: 10_000, commissionRate: 0.1, logisticsFee: 1_000 }).profit).toBeNull();
  });
});

describe("ads", () => {
  it("charges CPC per click and CPM per impression", () => {
    expect(adCharge("CPC", 500, "click")).toBe(500);
    expect(adCharge("CPC", 500, "impression")).toBe(0);
    expect(adCharge("CPM", 20_000, "impression")).toBe(20);
  });
  it("computes CTR, ROAS and ACoS", () => {
    const m = adMetrics({ impressions: 1000, clicks: 50, orders: 5, revenue: 500_000, spend: 25_000 });
    expect(m.ctr).toBe(0.05);
    expect(m.roas).toBe(20);
    expect(m.acos).toBe(0.05);
    expect(m.cpc).toBe(500);
  });
});

describe("payouts", () => {
  it("uses Monday–Sunday weeks in Tashkent time", () => {
    // Sunday 2026-10-18 21:00 UTC is Monday 02:00 in Tashkent.
    const w = payoutWeek(new Date("2026-10-18T21:00:00Z"));
    expect(w.start.toISOString()).toBe("2026-10-18T19:00:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(7 * 86_400_000);
  });
  it("pays on Wednesday", () => {
    const d = nextPayoutDate(new Date("2026-10-15T08:00:00Z")); // Thursday
    expect(new Date(d.getTime() + 5 * 3_600_000).getUTCDay()).toBe(3);
    expect(d > new Date("2026-10-15T08:00:00Z")).toBe(true);
  });
  it("nets out all deductions", () => {
    expect(payoutNet({ gross: 1_000_000, commission: 100_000, logistics: 50_000, adSpend: 20_000, penalties: 10_000, refunds: 30_000 })).toBe(790_000);
  });
});

describe("CSV import", () => {
  const cats = new Set(["smartfonlar", "kiyim"]);
  it("parses quotes, semicolons and BOM", () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"say ""hi"""\n')).toEqual([["a", "b"], ["x;1", 'say "hi"']]);
  });
  it("validates rows and reports issues per line", () => {
    const rows = parseCsv(["sku,title_uz,title_ru,category,price,old_price,stock", "A1,Telefon,Телефон,smartfonlar,1500000,1700000,5", "A1,Dup,Дубль,smartfonlar,1000,,1", "B2,,Нет,unknown,abc,100,-1"].join("\n"));
    const r = validateImport(rows, cats);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ sku: "A1", price: 1_500_000, oldPrice: 1_700_000, stock: 5 });
    expect(r.issues.map((i) => `${i.line}:${i.field}:${i.code}`)).toEqual(expect.arrayContaining(["3:sku:duplicateSku", "4:title_uz:required", "4:category:unknownCategory", "4:price:number", "4:stock:number"]));
  });
  it("rejects a sheet without required headers", () => {
    expect(validateImport([["name", "price"]], cats).issues[0].code).toBe("header");
  });
  it("escapes formulas and separators on export", () => {
    expect(toCsv([["=SUM(A1)", "a,b", 5]])).toBe("﻿'=SUM(A1),\"a,b\",5");
  });
});

describe("pre-moderation", () => {
  it("flags counterfeit and restricted goods", () => {
    expect(productNeedsReview("iPhone 15 kopiya 1:1")).toBe(true);
    expect(productNeedsReview("Paxta ko‘ylak")).toBe(false);
  });
});

describe("fulfillment score", () => {
  it("weights SLA, reviews, cancellations and returns", () => {
    const perfect = fulfillmentScore({ slaCompliance: 100, rating: 5, reviewCount: 10, cancellationRate: 0, returnRate: 0 });
    expect(perfect.score).toBe(100);
    // No reviews counts as a neutral 90.
    expect(fulfillmentScore({ slaCompliance: 100, rating: 0, reviewCount: 0, cancellationRate: 0, returnRate: 0 }).score).toBe(96.5);
    const bad = fulfillmentScore({ slaCompliance: 50, rating: 3, reviewCount: 20, cancellationRate: 0.3, returnRate: 0.5 });
    expect(bad.parts.cancellations).toBe(0);
    expect(bad.parts.returns).toBe(0);
    expect(bad.score).toBeCloseTo(50 * 0.35 + 60 * 0.35, 5);
  });
});

describe("Pro eligibility", () => {
  const now = new Date("2026-10-16T10:00:00Z");
  const ok = { score: 92, approvedAt: new Date("2026-06-01T00:00:00Z"), orders90d: 40, kycLevel: 2, certified: true, restricted: false };
  it("needs every requirement", () => {
    expect(proEligibility(ok, now).eligible).toBe(true);
    expect(proEligibility({ ...ok, certified: false }, now).checks.certified).toBe(false);
    expect(proEligibility({ ...ok, approvedAt: new Date("2026-10-01T00:00:00Z") }, now).eligible).toBe(false);
    expect(proEligibility({ ...ok, restricted: true }, now).eligible).toBe(false);
  });
});

describe("academy quiz", () => {
  it("grades with an 80% pass mark; unanswered is wrong", () => {
    expect(gradeQuiz([0, 1, 2, 0, 1], [0, 1, 2, 0, 1])).toMatchObject({ score: 100, passed: true });
    expect(gradeQuiz([0, 1, 2, 0, 1], [0, 1, 2, 0, null])).toMatchObject({ right: 4, score: 80, passed: true });
    expect(gradeQuiz([0, 1, 2, 0, 1], [0, 1, 0, 0, null])).toMatchObject({ score: 60, passed: false });
  });
});

describe("competitor price position", () => {
  it("classifies against the cheapest offer", () => {
    expect(pricePosition(100_000, []).status).toBe("alone");
    expect(pricePosition(95_000, [100_000, 120_000])).toMatchObject({ status: "cheapest", rank: 1, count: 3, median: 110_000 });
    expect(pricePosition(104_000, [100_000]).status).toBe("competitive");
    expect(pricePosition(110_000, [100_000, 105_000, 130_000])).toMatchObject({ status: "expensive", rank: 3, median: 105_000 });
  });
});

describe("seller API helpers", () => {
  const key = `anr_live_${"a1B2".repeat(10)}`;
  it("parses only well-formed bearer keys", () => {
    expect(bearerToken(`Bearer ${key}`)).toBe(key);
    expect(bearerToken(`bearer ${key}`)).toBe(key);
    expect(bearerToken("Bearer anr_live_short")).toBeNull();
    expect(bearerToken(key)).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
  it("detects private and reserved addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2a00:1450::1"]) expect(isPrivateIp(ip)).toBe(false);
  });
  it("accepts only public https webhook URLs", () => {
    expect(validateWebhookUrl("https://hooks.example.uz/anor")).toBe(true);
    expect(validateWebhookUrl("http://hooks.example.uz/anor")).toBe(false);
    expect(validateWebhookUrl("https://localhost/x")).toBe(false);
    expect(validateWebhookUrl("https://127.0.0.1/x")).toBe(false);
    expect(validateWebhookUrl("https://[::1]/x")).toBe(false);
    expect(validateWebhookUrl("https://user:pw@example.com/x")).toBe(false);
    expect(validateWebhookUrl("https://intranet/x")).toBe(false);
    expect(validateWebhookUrl("not a url")).toBe(false);
  });
});
