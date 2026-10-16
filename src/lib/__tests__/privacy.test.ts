import { describe, expect, it } from "vitest";
import { parseConsent, serializeConsent } from "../consent";
import { LEGAL } from "@/content/legal";

describe("cookie consent", () => {
  it("round-trips every combination and rejects anything else", () => {
    for (const analytics of [true, false]) for (const marketing of [true, false]) expect(parseConsent(serializeConsent({ analytics, marketing }))).toEqual({ analytics, marketing });
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("v1.a1")).toBeNull();
    expect(parseConsent("v2.a1.m1")).toBeNull();
    expect(parseConsent("v1.a1.m1;evil")).toBeNull();
  });
});

describe("legal documents", () => {
  it("exist in both languages with the same structure", () => {
    for (const doc of ["privacy", "terms", "cookies"] as const) {
      expect(LEGAL[doc].uz.sections.length).toBeGreaterThan(0);
      expect(LEGAL[doc].ru.sections.length).toBe(LEGAL[doc].uz.sections.length);
    }
  });
});
