// DTOs shared between server components, client components and the REST API.

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  hoverImage: string | null;
  price: number;
  oldPrice: number | null;
  discountPct: number;
  rating: number;
  reviewCount: number;
  soldCount: number;
  monthly: { amount: number; months: number } | null;
  variantId: string | null;
  variantCount: number;
  inStock: boolean;
  shopName: string;
  badges: { halal: boolean; madeInUz: boolean; official: boolean; preorder: boolean; used: boolean; fast: boolean; flash: boolean; lowest90: boolean };
  dealEndsAt: string | null;
  /** Overrides the product link (sponsored click tracking, A/B attribution). */
  href?: string;
  sponsored?: boolean;
  /** A/B test arm shown to this viewer; the product link carries it so clicks are attributed. */
  ab?: "A" | "B";
};

export type CartView = {
  id: string;
  kind: "PERSONAL" | "GROUP";
  shareCode: string | null;
  couponCode: string | null;
  groups: Array<{
    shopId: string;
    shopName: string;
    shopSlug: string;
    fulfillment: "FBO" | "FBS" | "DBS";
    items: CartItemView[];
  }>;
  totals: {
    itemsCount: number;
    listTotal: number;
    subtotal: number;
    productDiscount: number;
    promoDiscount: number;
    couponDiscount: number;
    couponError: string | null;
    freeDelivery: boolean;
    total: number;
    cashback: number;
    monthly: { amount: number; months: number } | null;
  };
  unavailable: CartItemView[];
};

export type CartItemView = {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  title: string;
  variantTitle: string;
  image: string | null;
  price: number;
  oldPrice: number | null;
  quantity: number;
  stock: number;
  selected: boolean;
  lineTotal: number;
  promoDiscount: number;
  isPreorder: boolean;
  addedBy: string | null;
  wholesale: boolean;
  /** Price and quantity fixed by an accepted B2B quote. */
  quoted: boolean;
};
