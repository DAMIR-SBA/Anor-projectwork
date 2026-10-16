import { describe, expect, it } from "vitest";
import { agingBucket, bannerState, nextYear } from "../admin";
import { bucket, compareRates, evaluateFlag, HOME_LAYOUTS, KNOWN_FLAGS, normalizeVariants, type FlagDef } from "../flags";
import { activeAnnouncement, DEFAULT_PLATFORM, mergePlatform, pickText, telegramUrl } from "../platform";
import { inflatedOldPrice, prohibitedTerms } from "../seller";
import { cashbackRate } from "../pricing";

describe("moderation signals", () => {
  it("finds restricted and counterfeit wording in both scripts", () => {
    expect(prohibitedTerms("Krossovka replika 1:1, original sifatida")).toEqual(["replika", "1:1"]);
    expect(prohibitedTerms("Кроссовки РЕПЛИКА")).toEqual(["реплика"]);
    expect(prohibitedTerms("Simsiz quloqchin")).toEqual([]);
  });
  it("flags a crossed-out price that was never charged", () => {
    expect(inflatedOldPrice(1_190_000, [360_000, 365_000], 349_000)).toBe(true);
    // Within 20% of the highest real price is a genuine discount.
    expect(inflatedOldPrice(430_000, [360_000, 365_000], 349_000)).toBe(false);
    expect(inflatedOldPrice(null, [], 349_000)).toBe(false);
    expect(inflatedOldPrice(300_000, [], 349_000)).toBe(false);
  });
});

describe("campaigns and banners", () => {
  it("moves a seasonal campaign to the same dates next year", () => {
    expect(nextYear(new Date("2026-11-11T00:00:00Z")).toISOString()).toBe("2027-11-11T00:00:00.000Z");
    expect(nextYear(new Date("2028-02-29T10:00:00Z")).toISOString()).toBe("2029-02-28T10:00:00.000Z");
  });
  it("derives banner state from the schedule", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    const d = (s: string) => new Date(s);
    expect(bannerState({ isActive: false, startsAt: null, endsAt: null }, now)).toBe("off");
    expect(bannerState({ isActive: true, startsAt: null, endsAt: null }, now)).toBe("live");
    expect(bannerState({ isActive: true, startsAt: d("2026-10-20T00:00:00Z"), endsAt: null }, now)).toBe("scheduled");
    expect(bannerState({ isActive: true, startsAt: null, endsAt: d("2026-10-16T12:00:00Z") }, now)).toBe("expired");
  });
});

describe("finance and loyalty", () => {
  it("buckets overdue installments", () => {
    expect([1, 30, 31, 60, 61, 90, 91, 400].map(agingBucket)).toEqual(["1-30", "1-30", "31-60", "31-60", "61-90", "61-90", "90+", "90+"]);
  });
  it("adds tier and Plus cashback, with admin-configured rates", () => {
    expect(cashbackRate("STANDARD", false)).toBeCloseTo(0.01);
    expect(cashbackRate("GOLD", true)).toBeCloseTo(0.05);
    const rates = { base: 0.015, silver: 0.005, gold: 0.01, plus: 0.03 };
    expect(cashbackRate("SILVER", false, rates)).toBeCloseTo(0.02);
    expect(cashbackRate("GOLD", true, rates)).toBeCloseTo(0.055);
  });
});

describe("feature flags", () => {
  const flag = (p: Partial<FlagDef> = {}): FlagDef => ({ key: "home.layout", enabled: true, rolloutPercent: 100, variants: [{ key: "classic", weight: 50 }, { key: "deals_first", weight: 50 }], ...p });

  it("hashes deterministically into 0..9999", () => {
    expect(bucket("abc")).toBe(bucket("abc"));
    expect(bucket("abc")).not.toBe(bucket("abd"));
    for (const s of ["", "x", "visitor-123"]) {
      expect(bucket(s)).toBeGreaterThanOrEqual(0);
      expect(bucket(s)).toBeLessThan(10_000);
    }
  });
  it("keeps a visitor in the same arm and splits traffic by weight", () => {
    expect(evaluateFlag(flag(), "v-1")).toEqual(evaluateFlag(flag(), "v-1"));
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const v = evaluateFlag(flag({ variants: [{ key: "a", weight: 75 }, { key: "b", weight: 25 }] }), `visitor-${i}`).variant!;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    expect(counts.a / 4000).toBeGreaterThan(0.71);
    expect(counts.a / 4000).toBeLessThan(0.79);
  });
  it("respects off flags, partial rollout and missing visitor ids", () => {
    expect(evaluateFlag(flag({ enabled: false }), "v")).toEqual({ on: false, variant: null });
    expect(evaluateFlag(undefined, "v")).toEqual({ on: false, variant: null });
    let on = 0;
    for (let i = 0; i < 2000; i++) if (evaluateFlag(flag({ rolloutPercent: 20, variants: null }), `u${i}`).on) on++;
    expect(on / 2000).toBeGreaterThan(0.16);
    expect(on / 2000).toBeLessThan(0.24);
    expect(evaluateFlag(flag({ rolloutPercent: 50 }), null)).toEqual({ on: false, variant: null });
    expect(evaluateFlag(flag(), null)).toEqual({ on: true, variant: "classic" });
  });
  it("drops malformed variants", () => {
    expect(normalizeVariants([{ key: "a", weight: 1 }, { key: "b", weight: 0 }, { nope: 1 }])).toEqual([{ key: "a", weight: 1 }]);
    expect(normalizeVariants("x")).toBeNull();
  });
  it("only declares layouts that list every homepage block", () => {
    const blocks = [...HOME_LAYOUTS.classic].sort();
    for (const v of KNOWN_FLAGS["home.layout"].variants!) expect([...HOME_LAYOUTS[v]].sort()).toEqual(blocks);
  });
  it("tests significance only with enough data", () => {
    expect(compareRates({ n: 20, x: 1 }, { n: 20, x: 3 })).toBeNull();
    const r = compareRates({ n: 2400, x: 72 }, { n: 2400, x: 101 })!;
    expect(r.lift).toBeCloseTo(0.403, 2);
    expect(r.significant).toBe(true);
    expect(compareRates({ n: 1600, x: 50 }, { n: 1600, x: 64 })!.significant).toBe(false);
  });
});

describe("platform settings", () => {
  it("fills missing fields from defaults", () => {
    expect(mergePlatform(null)).toEqual(DEFAULT_PLATFORM);
    expect(mergePlatform({ support: { phone: "+998" } }).support).toEqual({ phone: "+998", email: "", telegram: "" });
  });
  it("shows an announcement only inside its window", () => {
    const s = mergePlatform({ announcement: { enabled: true, textUz: "Salom", startsAt: "2026-10-10T00:00:00Z", endsAt: "2026-10-20T00:00:00Z" } });
    expect(activeAnnouncement(s, new Date("2026-10-15T00:00:00Z"))?.textUz).toBe("Salom");
    expect(activeAnnouncement(s, new Date("2026-10-21T00:00:00Z"))).toBeNull();
    expect(activeAnnouncement(mergePlatform({ announcement: { enabled: true } }), new Date())).toBeNull();
  });
  it("picks the locale text with fallbacks", () => {
    expect(pickText("Salom", "Привет", "ru")).toBe("Привет");
    expect(pickText("Salom", "", "ru")).toBe("Salom");
    expect(pickText("Salom", "Привет", "uz-Cyrl")).toBe("Салом");
    expect(pickText("", "Привет", "uz")).toBe("Привет");
  });
  it("normalizes Telegram handles", () => {
    expect(telegramUrl("@anor_help")).toBe("https://t.me/anor_help");
    expect(telegramUrl("https://t.me/anor_help")).toBe("https://t.me/anor_help");
    expect(telegramUrl("javascript:alert(1)")).toBeNull();
    expect(telegramUrl("")).toBeNull();
  });
});
