import "server-only";

export type TaxpayerStatus = "active" | "inactive" | "not_found";

/**
 * Taxpayer lookup by STIR. Production plugs the tax authority's open API here; the demo
 * provider answers deterministically so every case can be tried:
 * ending in 000 → not found, ending in 999 → inactive (liquidated), anything else → active.
 */
export interface TaxRegistry {
  lookup(taxId: string): Promise<{ status: TaxpayerStatus }>;
}

const mockRegistry: TaxRegistry = {
  async lookup(taxId) {
    if (taxId.endsWith("000")) return { status: "not_found" };
    if (taxId.endsWith("999")) return { status: "inactive" };
    return { status: "active" };
  },
};

export function taxRegistry(): TaxRegistry {
  return mockRegistry;
}
