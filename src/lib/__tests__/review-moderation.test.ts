import { describe, expect, it } from "vitest";
import { evaluateReview, hasContacts, hasProfanity, looksLikeSpam, maskContacts, summarizeReviews } from "../review-moderation";

const base = { rating: 4, accountAgeDays: 200, duplicateOfOwn: false, duplicateAcrossUsers: false, recentNewAccount5StarsOnProduct: 0 };

describe("contact detection and masking", () => {
  it("finds Uzbek phone numbers, links, handles and emails", () => {
    expect(hasContacts("Qo‘ng‘iroq qiling +998 90 123 45 67").phone).toBe(true);
    expect(hasContacts("Kanal: t.me/arzon_shop").link).toBe(true);
    expect(hasContacts("Yozing @arzon_telefonlar").contact).toBe(true);
    expect(hasContacts("pochta: sotuv@example.com").contact).toBe(true);
    expect(hasContacts("Batareya 5000 mAh, 2 kunga yetadi")).toEqual({ link: false, phone: false, contact: false });
  });

  it("masks every contact and keeps the rest of the text", () => {
    const out = maskContacts("Arzon: +998 90 123 45 67 yoki www.arzon.uz, @arzon_shop");
    expect(out).not.toMatch(/998|arzon\.uz|@arzon_shop/);
    expect(out.startsWith("Arzon:")).toBe(true);
  });

  it("removes the whole link including its path", () => {
    expect(maskContacts("Sharhim: t.me/gadjet_sharh_uz, ko‘ring")).toBe("Sharhim: ••• ko‘ring");
    expect(maskContacts("https://arzon.uz/iphone?x=1 dan oling")).toBe("••• dan oling");
  });
});

describe("profanity and spam", () => {
  it("matches word stems in Latin and Cyrillic, case-insensitively", () => {
    expect(hasProfanity("Sotuvchi AHMOQ ekan")).toBe(true);
    expect(hasProfanity("Бля, сломался")).toBe(true);
    expect(hasProfanity("Juda yaxshi mahsulot")).toBe(false);
  });

  it("flags shouting, repeats and promo keywords", () => {
    expect(looksLikeSpam("ZO‘R ZO‘R ZO‘R HAMMAGA TAVSIYA QILAMAN")).toBe(true);
    expect(looksLikeSpam("Ajoyiiiiiiiib")).toBe(true);
    expect(looksLikeSpam("Promokod bilan arzonroq")).toBe(true);
    expect(looksLikeSpam("Yaxshi, lekin biroz qimmat!")).toBe(false);
  });
});

describe("evaluateReview", () => {
  it("passes a clean review", () => {
    expect(evaluateReview({ ...base, text: "Sifati yaxshi, tez yetkazishdi" })).toEqual({ flags: [], score: 0 });
  });

  it("flags 5★ from fresh accounts and bursts", () => {
    const r = evaluateReview({ ...base, rating: 5, accountAgeDays: 2, recentNewAccount5StarsOnProduct: 3, text: "Zo‘r" });
    expect(r.flags).toEqual(expect.arrayContaining(["NEW_ACCOUNT_5STAR", "BURST_5STAR"]));
    expect(r.score).toBe(55);
  });

  it("caps the score at 100", () => {
    const r = evaluateReview({ ...base, rating: 5, accountAgeDays: 1, duplicateAcrossUsers: true, recentNewAccount5StarsOnProduct: 5, text: "AHMOQ!!!! +998 90 123 45 67 t.me/x_shop" });
    expect(r.score).toBe(100);
  });
});

describe("summarizeReviews", () => {
  const rows = [
    { rating: 5, pros: "Batareya uzoq ushlaydi, Ekrani tiniq", cons: "Zaryadlovchi yo‘q", comment: "Ekrani tiniq va yorqin", lang: "uz" },
    { rating: 4, pros: "Ekrani tiniq", cons: "Zaryadlovchi yo‘q", comment: "Batareya uzoq ushlaydi", lang: "uz" },
    { rating: 5, pros: "Batareya uzoq ushlaydi", cons: null, comment: "Ekrani tiniq, batareya uzoq ushlaydi", lang: "uz" },
    { rating: 4, pros: "Быстрая доставка", cons: null, comment: null, lang: "ru" },
  ];

  it("keeps whole recurring clauses as pros/cons", () => {
    const s = summarizeReviews(rows);
    expect(s.pros).toEqual(expect.arrayContaining(["Batareya uzoq ushlaydi", "Ekrani tiniq"]));
    expect(s.cons).toEqual(["Zaryadlovchi yo‘q"]);
    expect(s.basedOn).toBe(4);
  });

  it("uses Uzbek reviews for the main summary and omits a thin Russian one", () => {
    const s = summarizeReviews(rows);
    expect(s.pros.join(" ")).not.toMatch(/[а-я]/i);
    expect(s.ru).toBeUndefined();
  });

  it("picks two-word topics that don't share words", () => {
    const words = summarizeReviews(rows).mentions.flatMap((m) => m.term.split(" "));
    expect(new Set(words).size).toBe(words.length);
  });
});
