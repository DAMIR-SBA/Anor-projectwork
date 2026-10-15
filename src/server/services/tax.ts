import "server-only";
import { db, type Tx } from "@/server/db";
import { env } from "@/server/env";
import { randomDigits } from "@/server/security/crypto";

/**
 * TaxProvider interface — real implementation would register the sale with the fiscal
 * operator (OFD) and return the fiscal sign. The mock produces a deterministic-looking
 * receipt whose QR points at our own verification page.
 */
export interface TaxProvider {
  issue(order: { id: string; number: string; total: number }): Promise<{ receiptNo: string; fiscalSign: string; terminalId: string; qrUrl: string; vat: number }>;
}

export const VAT_RATE = 0.12;

export const mockTaxProvider: TaxProvider = {
  async issue(order) {
    const receiptNo = `${new Date().getFullYear()}${randomDigits(9)}`;
    const fiscalSign = randomDigits(12);
    const terminalId = "EP000000000123";
    const vat = Math.round((order.total * VAT_RATE) / (1 + VAT_RATE));
    const qrUrl = `${env().APP_URL}/receipt/${order.id}?s=${fiscalSign}`;
    return { receiptNo, fiscalSign, terminalId, qrUrl, vat };
  },
};

export async function issueFiscalReceipt(orderId: string, tx?: Tx) {
  const client = tx ?? db;
  const order = await client.order.findUniqueOrThrow({ where: { id: orderId }, include: { receipt: true } });
  if (order.receipt) return order.receipt;
  const r = await mockTaxProvider.issue({ id: order.id, number: order.number, total: order.total });
  return client.fiscalReceipt.create({ data: { orderId, receiptNo: r.receiptNo, fiscalSign: r.fiscalSign, terminalId: r.terminalId, qrUrl: r.qrUrl, total: order.total, vat: r.vat, raw: { provider: "mock" } } });
}
