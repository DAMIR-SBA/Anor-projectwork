import { describe, expect, it } from "vitest";
import { ageOn, DEFAULT_NASIYA, maskPassport, mockScore, principalShare, repaymentAmount, type ScoringInput } from "../nasiya";
import { addMonths, annualSavingPct, PLUS_PLANS } from "../plus";
import { achieved, checkInPoints, nextStreak, pickPrize, publicName, WHEEL } from "../gamification";
import { botLocale, parseCommand, signWebAppInitData, verifyWebAppInitData } from "../telegram";
import { parseBudget, parseQuery } from "../assistant";
import { holidayOn } from "../holidays";

describe("Nasiya scoring", () => {
  const base: ScoringInput = { birthDate: new Date("1990-05-10"), monthlyIncome: 8_000_000, employment: "employed", phoneVerified: true, deliveredOrders: 6, paidOnTime: 4, overdueNow: 0, activeContracts: 0, duplicateIdentity: false };
  const now = new Date("2026-10-16T12:00:00Z");

  it("approves with a limit from income, capped and rounded to 100 000", () => {
    const r = mockScore(base, DEFAULT_NASIYA, now);
    expect(r.decision).toBe("APPROVED");
    expect(r.limit % 100_000).toBe(0);
    expect(r.limit).toBeGreaterThanOrEqual(DEFAULT_NASIYA.defaultLimit);
    expect(r.limit).toBeLessThanOrEqual(DEFAULT_NASIYA.maxLimit);
    expect(mockScore({ ...base, monthlyIncome: 90_000_000 }, DEFAULT_NASIYA, now).limit).toBe(DEFAULT_NASIYA.maxLimit);
  });
  it("rejects on hard rules with every reason listed", () => {
    const r = mockScore({ ...base, birthDate: new Date("2010-01-01"), monthlyIncome: 500_000, overdueNow: 1, duplicateIdentity: true }, DEFAULT_NASIYA, now);
    expect(r.decision).toBe("REJECTED");
    expect(r.reasons).toEqual(expect.arrayContaining(["age", "income", "overdue", "duplicate"]));
    expect(r.limit).toBe(0);
  });
  it("sends borderline profiles to manual review", () => {
    const r = mockScore({ ...base, employment: "student", monthlyIncome: 1_600_000, deliveredOrders: 0, paidOnTime: 0 }, DEFAULT_NASIYA, now);
    expect(r.decision).toBe("REVIEW");
  });
  it("computes age on a date and masks the passport", () => {
    expect(ageOn(new Date("2005-10-17"), now)).toBe(20);
    expect(ageOn(new Date("2005-10-16"), now)).toBe(21);
    expect(maskPassport("ab 1234567")).toBe("AB*****67");
  });
  it("charges next, overdue or an early payoff without future markup", () => {
    const c = { principal: 6_000_000, months: 6 };
    const rows = [1, 2, 3, 4, 5, 6].map((index) => ({ index, amount: 1_120_000, paidAmount: 0, status: (index <= 2 ? "PAID" : index === 3 ? "OVERDUE" : "DUE") as "PAID" | "OVERDUE" | "DUE", dueDate: new Date() }));
    expect(repaymentAmount(c, rows, "next")).toEqual({ amount: 1_120_000, indexes: [3] });
    expect(repaymentAmount(c, rows, "overdue")).toEqual({ amount: 1_120_000, indexes: [3] });
    const payoff = repaymentAmount(c, rows, "payoff");
    expect(payoff.amount).toBe(4_000_000);
    expect(payoff.amount).toBeLessThan(4 * 1_120_000);
    expect(principalShare(c, 2)).toBe(2_000_000);
  });
});

describe("ANOR Plus", () => {
  it("adds months keeping the day, clamped to the month end", () => {
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonths(new Date("2026-10-16T00:00:00Z"), 12).toISOString()).toBe("2027-10-16T00:00:00.000Z");
  });
  it("annual plan is cheaper than twelve months", () => {
    expect(PLUS_PLANS.PLUS_ANNUAL.price).toBeLessThan(PLUS_PLANS.PLUS_MONTHLY.price * 12);
    expect(annualSavingPct()).toBeGreaterThan(0);
  });
});

describe("gamification", () => {
  it("continues streaks only from yesterday", () => {
    expect(nextStreak(null, "2026-10-16")).toBe(1);
    expect(nextStreak({ day: "2026-10-15", streak: 4 }, "2026-10-16")).toBe(5);
    expect(nextStreak({ day: "2026-10-14", streak: 4 }, "2026-10-16")).toBe(1);
    expect(nextStreak({ day: "2026-12-31", streak: 9 }, "2027-01-01")).toBe(10);
  });
  it("pays more for longer streaks and a bonus every 7th day", () => {
    expect([1, 2, 6, 7, 8].map(checkInPoints)).toEqual([100, 150, 350, 1_000, 100]);
  });
  it("draws prizes by weight across the whole range", () => {
    expect(pickPrize(0).key).toBe(WHEEL[0].key);
    expect(pickPrize(0.99999).key).toBe(WHEEL[WHEEL.length - 1].key);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) counts[pickPrize(i / 1000).key] = (counts[pickPrize(i / 1000).key] ?? 0) + 1;
    const total = WHEEL.reduce((s, p) => s + p.weight, 0);
    for (const p of WHEEL) expect(Math.abs(counts[p.key] / 1000 - p.weight / total)).toBeLessThan(0.01);
  });
  it("checks achievement rules and hides surnames on leaderboards", () => {
    const m = { orders: 3, reviews: 0, photoReviews: 0, checkinStreak: 7, referrals: 0 };
    expect(achieved({ metric: "orders", gte: 1 }, m)).toBe(true);
    expect(achieved({ metric: "reviews", gte: 1 }, m)).toBe(false);
    expect(achieved({ nonsense: true }, m)).toBe(false);
    expect(publicName("Aziza Karimova", "demo_buyer")).toBe("Aziza K.");
    expect(publicName(null, "demo_buyer")).toBe("dem***");
  });
});

describe("Telegram", () => {
  const token = "123456:TEST-token";
  const now = Date.UTC(2026, 9, 16, 12);
  const fields = { auth_date: String(Math.floor(now / 1000) - 60), query_id: "AAH", user: JSON.stringify({ id: 42, first_name: "Aziza", username: "aziza" }), start_param: "p_iphone-15" };
  it("accepts correctly signed, fresh initData", () => {
    const r = verifyWebAppInitData(signWebAppInitData(fields, token), token, now);
    expect(r.ok && r.user.id === 42 && r.startParam === "p_iphone-15").toBe(true);
  });
  it("rejects tampering, another bot's signature and stale data", () => {
    const signed = signWebAppInitData(fields, token);
    expect(verifyWebAppInitData(signed.replace("Aziza", "Admin"), token, now).ok).toBe(false);
    expect(verifyWebAppInitData(signed, "999:OTHER", now).ok).toBe(false);
    expect(verifyWebAppInitData(signed, token, now + 2 * 86_400_000).ok).toBe(false);
    expect(verifyWebAppInitData("user=%7B%7D", token, now).ok).toBe(false);
  });
  it("parses bot commands and language", () => {
    expect(parseCommand("/start abc123")).toEqual({ command: "start", arg: "abc123" });
    expect(parseCommand("/orders@anor_bot")).toEqual({ command: "orders", arg: "" });
    expect(parseCommand("salom")).toBeNull();
    expect(botLocale("ru-RU")).toBe("ru");
    expect(botLocale("en")).toBe("uz");
  });
});

describe("assistant query parsing", () => {
  it("reads budgets in Uzbek, Russian and English", () => {
    expect(parseBudget("noutbuk 8 mln gacha")).toEqual({ max: 8_000_000 });
    expect(parseBudget("ноутбук до 8 млн")).toEqual({ max: 8_000_000 });
    expect(parseBudget("laptop up to 8 million")).toEqual({ max: 8_000_000 });
    expect(parseBudget("telefon 2-5 mln")).toEqual({ min: 2_000_000, max: 5_000_000 });
    expect(parseBudget("sovg‘a 300 000 so‘mgacha")).toEqual({ max: 300_000 });
    expect(parseBudget("наушники до 500 тыс")).toEqual({ max: 500_000 });
    expect(parseBudget("от 10 млн")).toEqual({ min: 10_000_000 });
    expect(parseBudget("qizil ko‘ylak")).toEqual({});
  });
  it("finds category, purpose and intent without leaking purpose words into the query", () => {
    expect(parseQuery("O‘qish uchun noutbuk 8 mln gacha")).toMatchObject({ kind: "search", category: "noutbuklar", maxPrice: 8_000_000, features: ["study"], query: "" });
    expect(parseQuery("laptop for study up to 8 million so'm").sort).toBeUndefined();
    expect(parseQuery("arzon quloqchin")).toMatchObject({ category: "quloqchinlar", sort: "price_asc" });
    expect(parseQuery("Samsung va Xiaomi telefonlarini solishtir")).toMatchObject({ kind: "compare", category: "smartfonlar", query: "samsung xiaomi" });
    expect(parseQuery("bu telefonda NFC bormi?")).toMatchObject({ kind: "question", query: "nfc" });
    expect(parseQuery("salom").kind).toBe("greeting");
  });
});

describe("holidays", () => {
  it("greets on fixed-date holidays only", () => {
    expect(holidayOn("2027-03-21")?.key).toBe("navruz");
    expect(holidayOn("2027-03-23")?.key).toBe("navruz");
    expect(holidayOn("2027-03-24")).toBeNull();
    expect(holidayOn("2026-09-01")?.key).toBe("independence");
    expect(holidayOn("2026-10-16")).toBeNull();
  });
});
