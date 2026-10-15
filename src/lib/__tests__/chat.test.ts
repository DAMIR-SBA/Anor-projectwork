import { describe, expect, it } from "vitest";
import { canEdit, dayKey, downsample, filterMessage, matchCanned, receiptState, slaState } from "../chat";

describe("filterMessage", () => {
  it("masks contacts only in buyer↔seller chats", () => {
    const text = "Telegramdan yozing @arzon_shop yoki +998 90 123 45 67";
    const bs = filterMessage(text, "BUYER_SELLER");
    expect(bs.masked).toBe(true);
    expect(bs.text).not.toMatch(/arzon_shop|998/);
    const sup = filterMessage(text, "SUPPORT");
    expect(sup.masked).toBe(false);
    expect(sup.text).toBe(text);
  });

  it("stars out profanity and flags the message", () => {
    const r = filterMessage("Sen ahmoq ekansan", "SUPPORT");
    expect(r.text).toBe("Sen ***** ekansan");
    expect(r.flagged).toBe(true);
  });

  it("flags repeated identical messages as spam", () => {
    expect(filterMessage("Chegirma bormi?", "BUYER_SELLER", ["chegirma bormi?", "Chegirma bormi?"]).flagged).toBe(true);
    expect(filterMessage("Chegirma bormi?", "BUYER_SELLER", ["Salom"]).flagged).toBe(false);
  });
});

describe("slaState", () => {
  const now = Date.parse("2026-10-15T10:00:00Z");
  it("reports remaining time, warning and breach", () => {
    expect(slaState({ slaDueAt: new Date(now + 12 * 60_000), firstResponseAt: null, status: "NEW" }, now)).toEqual({ state: "ok", minutesLeft: 12 });
    expect(slaState({ slaDueAt: new Date(now + 3 * 60_000), firstResponseAt: null, status: "NEW" }, now).state).toBe("warning");
    expect(slaState({ slaDueAt: new Date(now - 60_000), firstResponseAt: null, status: "NEW" }, now).state).toBe("breached");
  });
  it("is met when the first reply came before the deadline", () => {
    expect(slaState({ slaDueAt: new Date(now), firstResponseAt: new Date(now - 1000), status: "IN_PROGRESS" }, now).state).toBe("met");
    expect(slaState({ slaDueAt: new Date(now), firstResponseAt: new Date(now + 1000), status: "IN_PROGRESS" }, now).state).toBe("breached");
  });
});

describe("receipts and helpers", () => {
  const at = "2026-10-15T10:00:00Z";
  it("derives sent / delivered / read from member timestamps", () => {
    expect(receiptState(at, [{ lastReadAt: null, lastDeliveredAt: null }])).toBe("sent");
    expect(receiptState(at, [{ lastReadAt: null, lastDeliveredAt: "2026-10-15T10:00:05Z" }])).toBe("delivered");
    expect(receiptState(at, [{ lastReadAt: "2026-10-15T10:01:00Z", lastDeliveredAt: null }])).toBe("read");
  });
  it("uses the Tashkent day for separators", () => {
    expect(dayKey("2026-10-15T20:30:00Z")).toBe("2026-10-16");
  });
  it("allows edits for 48 hours", () => {
    const now = Date.parse(at);
    expect(canEdit(new Date(now - 47 * 3_600_000), now)).toBe(true);
    expect(canEdit(new Date(now - 49 * 3_600_000), now)).toBe(false);
  });
  it("downsamples waveforms to a fixed number of bars", () => {
    const bars = downsample(Array.from({ length: 400 }, (_, i) => (i % 50) / 50), 40);
    expect(bars).toHaveLength(40);
    expect(Math.max(...bars)).toBeLessThanOrEqual(1);
  });
  it("matches canned replies by shortcut prefix", () => {
    expect(matchCanned("/sal", [{ shortcut: "salom" }, { shortcut: "qaytarish" }])).toEqual([{ shortcut: "salom" }]);
    expect(matchCanned("salom", [{ shortcut: "salom" }])).toEqual([]);
  });
});
