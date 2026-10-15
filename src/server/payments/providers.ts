import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/server/env";
import { randomToken, safeEqual } from "@/server/security/crypto";
import type { PaymentMethod } from "@/generated/prisma/enums";

export type ProviderResult = { status: "PENDING" | "PAID" | "AUTHORIZED" | "FAILED"; redirectUrl?: string; externalId?: string };

/**
 * One interface for every payment rail. Real integrations (Click, Payme, Uzcard, Humo,
 * Visa/Mastercard acquiring) implement the same three calls; here they are mocks that
 * route through a hosted test page and a signed callback, mirroring the real flow.
 */
export interface PaymentProvider {
  method: PaymentMethod;
  label: string;
  online: boolean;
  createPayment(p: { id: string; amount: number; savedCardToken?: string | null }): Promise<ProviderResult>;
  refund(p: { id: string; externalId: string | null; amount: number }): Promise<{ ok: boolean; externalId: string }>;
}

function mockGateway(method: PaymentMethod, label: string): PaymentProvider {
  return {
    method,
    label,
    online: true,
    async createPayment(p) {
      const externalId = `${method.toLowerCase()}_${randomToken(8)}`;
      // A tokenized saved card charges immediately (no redirect), like a real recurring token.
      if (p.savedCardToken) return { status: "PAID", externalId };
      return { status: "PENDING", externalId, redirectUrl: `/pay/${p.id}` };
    },
    async refund(p) {
      return { ok: true, externalId: `rf_${p.externalId ?? p.id}_${randomToken(4)}` };
    },
  };
}

const offline = (method: PaymentMethod, label: string): PaymentProvider => ({
  method,
  label,
  online: false,
  async createPayment() {
    return { status: "PENDING" };
  },
  async refund(p) {
    return { ok: true, externalId: `manual_${p.id}` };
  },
});

export const PROVIDERS: Record<PaymentMethod, PaymentProvider> = {
  CLICK: mockGateway("CLICK", "Click"),
  PAYME: mockGateway("PAYME", "Payme"),
  UZCARD: mockGateway("UZCARD", "Uzcard"),
  HUMO: mockGateway("HUMO", "Humo"),
  CARD: mockGateway("CARD", "Visa / Mastercard"),
  COD: offline("COD", "Cash on delivery"),
  WALLET: offline("WALLET", "Anor Hamyon"),
  INSTALLMENT: offline("INSTALLMENT", "ANOR NASIYA"),
  BANK_TRANSFER: offline("BANK_TRANSFER", "Bank transfer"),
};

/** Signature for provider → ANOR callbacks (mock providers sign with our derived key). */
export function callbackSignature(paymentId: string, status: string, amount: number): string {
  return createHmac("sha256", `${env().SESSION_SECRET}:payments`).update(`${paymentId}|${status}|${amount}`).digest("hex");
}

export function verifyCallback(paymentId: string, status: string, amount: number, sig: string): boolean {
  return safeEqual(callbackSignature(paymentId, status, amount), sig);
}

export function cardBrand(pan: string): string {
  const d = pan.replace(/\D/g, "");
  if (/^8600/.test(d)) return "Uzcard";
  if (/^9860/.test(d)) return "Humo";
  if (/^4/.test(d)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard";
  return "Card";
}
