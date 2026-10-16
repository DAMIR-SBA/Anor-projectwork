import { describe, expect, it } from "vitest";
import { estimate, grade, offerAllowed, type Answers } from "../tradein";
import { activeTimedPrice, timedPriceAllowed, withTimedPrice, type TimedPrice } from "../live";
import { videoSources } from "../media";
import { compactCount } from "../money";
import { openApiDocument } from "../openapi";

const ok: Answers = { powersOn: true, screen: "perfect", body: "perfect", battery: "good", accessories: false, locked: false };

describe("trade-in grading", () => {
  it("grades by the worst problem", () => {
    expect(grade(ok)).toBe("A");
    expect(grade({ ...ok, screen: "scratches" })).toBe("B");
    expect(grade({ ...ok, battery: "poor" })).toBe("C");
    expect(grade({ ...ok, screen: "cracked", body: "heavy" })).toBe("D");
    expect(grade({ ...ok, powersOn: false })).toBe("D");
  });
  it("estimates from the price list, rounded down to 10 000", () => {
    expect(estimate(6_500_000, { ...ok, screen: "scratches" })).toEqual({ grade: "B", value: 5_200_000 });
    expect(estimate(3_800_000, { ...ok, accessories: true }).value).toBe(3_910_000);
    expect(estimate(9_500_000, { ...ok, locked: true }).value).toBe(0);
  });
  it("caps staff offers at the grade-A price with accessories", () => {
    expect(offerAllowed(3_800_000, 3_910_000)).toBe(true);
    expect(offerAllowed(3_800_000, 3_920_000)).toBe(false);
    expect(offerAllowed(3_800_000, 0)).toBe(false);
  });
});

describe("live prices", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const list: TimedPrice[] = [
    { productId: "p1", price: 80_000, from: "2026-10-16T11:55:00Z", to: "2026-10-16T12:05:00Z" },
    { productId: "p1", price: 70_000, from: "2026-10-16T11:00:00Z", to: "2026-10-16T11:30:00Z" },
    { productId: "p2", price: 50_000, from: "2026-10-16T12:01:00Z", to: "2026-10-16T12:10:00Z" },
  ];
  it("applies only inside the window", () => {
    expect(activeTimedPrice(list, "p1", now)?.price).toBe(80_000);
    expect(activeTimedPrice(list, "p2", now)).toBeNull();
    expect(activeTimedPrice(list, "p1", new Date("2026-10-16T12:05:00Z"))).toBeNull();
  });
  it("refuses prices at or above list and suspiciously low ones", () => {
    expect(timedPriceAllowed(100_000, 85_000)).toBe(true);
    expect(timedPriceAllowed(100_000, 100_000)).toBe(false);
    expect(timedPriceAllowed(100_000, 29_000)).toBe(false);
  });
  it("closes the open window when a new price starts", () => {
    const next = withTimedPrice(list, "p1", 75_000, 10, now);
    expect(next.filter((p) => p.productId === "p1" && Date.parse(p.to) > now.getTime())).toHaveLength(1);
    expect(activeTimedPrice(next, "p1", new Date(now.getTime() + 60_000))?.price).toBe(75_000);
  });
});

describe("media and formatting", () => {
  it("offers WebM first for bundled demo clips only", () => {
    expect(videoSources("/demo/videos/kuk-choy.mp4").map((s) => s.type)).toEqual(["video/webm", "video/mp4"]);
    expect(videoSources("/uploads/products/x.mp4")).toEqual([{ src: "/uploads/products/x.mp4", type: "video/mp4" }]);
  });
  it("formats counts the same on server and client", () => {
    expect(compactCount(950, "uz")).toBe("950");
    expect(compactCount(3_121, "uz")).toBe("3,1 ming");
    expect(compactCount(12_300, "ru")).toBe("12,3 тыс.");
    expect(compactCount(1_200_000, "uz-Cyrl")).toBe("1,2 млн");
  });
});

describe("OpenAPI document", () => {
  it("describes every endpoint with security on seller routes only", () => {
    const doc = openApiDocument("https://anor.example");
    expect(doc.openapi).toBe("3.1.0");
    const ops = Object.values(doc.paths).flatMap((p) => Object.values(p)) as Array<{ tags: string[]; security: unknown[] }>;
    expect(ops.length).toBeGreaterThanOrEqual(12);
    for (const op of ops) expect(op.security.length > 0).toBe(op.tags[0] === "seller");
  });
});
