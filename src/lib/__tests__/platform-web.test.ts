import { describe, expect, it } from "vitest";
import { resolveDeepLink } from "../deeplink";
import { campaignOpenFor } from "../campaign";
import { checkoutSlots } from "../delivery";

describe("deep links", () => {
  const host = "anor.uz";
  it("maps app links to storefront paths", () => {
    expect(resolveDeepLink("web+anor://p/kuk-choy-95", host)).toBe("/p/kuk-choy-95");
    expect(resolveDeepLink("web%2Banor%3A%2F%2Fc%2Fsmartfonlar", host)).toBe("/c/smartfonlar");
    expect(resolveDeepLink("https://anor.uz/ru/p/x?ref=tg", host)).toBe("/ru/p/x?ref=tg");
    expect(resolveDeepLink("/account/orders/abc123", host)).toBe("/account/orders/abc123");
  });
  it("sends everything else home", () => {
    for (const bad of ["https://evil.example/p/x", "//evil.example", "web+anor://admin/staff", "javascript:alert(1)", "/seller/finance", "/p/../admin", "%E0%A4%A", null]) expect(resolveDeepLink(bad, host)).toBe("/");
  });
});

describe("campaign early access", () => {
  const c = { startsAt: new Date("2026-11-11T00:00:00Z"), plusEarlyHours: 2 };
  it("opens early for Plus members only", () => {
    const early = Date.parse("2026-11-10T23:00:00Z");
    expect(campaignOpenFor(c, true, early)).toBe(true);
    expect(campaignOpenFor(c, false, early)).toBe(false);
    expect(campaignOpenFor(c, false, Date.parse("2026-11-11T00:00:01Z"))).toBe(true);
    expect(campaignOpenFor(c, true, Date.parse("2026-11-10T21:59:00Z"))).toBe(false);
  });
});

describe("checkout slots", () => {
  it("start at least two hours from now and never before the parcel can arrive", () => {
    const now = Date.parse("2026-10-16T05:00:00Z"); // 10:00 in Tashkent
    const slots = checkoutSlots([], now);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].start.getTime()).toBeGreaterThanOrEqual(now);
    const later = checkoutSlots(["2026-10-18T09:00:00Z"], now);
    expect(later[0].start.getTime()).toBeGreaterThan(Date.parse("2026-10-17T12:00:00Z"));
  });
});
