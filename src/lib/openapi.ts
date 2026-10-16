// The public REST API described once (OpenAPI 3.1). Served at /api/v1/openapi.json and rendered
// on /developers, so the docs and the machine-readable spec cannot drift apart.

export type Endpoint = {
  id: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  group: "catalog" | "seller" | "system";
  summary: string;
  scope?: "products:read" | "products:write" | "orders:read" | "orders:write";
  query?: Array<{ name: string; type: "string" | "integer" | "boolean" | "date-time"; description: string; enum?: string[] }>;
  body?: Record<string, unknown>;
  example?: unknown;
};

const page = [
  { name: "page", type: "integer", description: "Page number, from 1" },
  { name: "per_page", type: "integer", description: "Items per page, 1–100 (default 50)" },
] as const;

export const ENDPOINTS: Endpoint[] = [
  {
    id: "listProducts",
    method: "GET",
    path: "/api/v1/products",
    group: "catalog",
    summary: "Public catalog listing with filters and sorting",
    query: [
      { name: "q", type: "string", description: "Search text (Latin or Cyrillic)" },
      { name: "category", type: "string", description: "Category slug, includes subcategories" },
      { name: "brand", type: "string", description: "Brand slug; repeat for several" },
      { name: "min", type: "integer", description: "Minimum price, so‘m" },
      { name: "max", type: "integer", description: "Maximum price, so‘m" },
      { name: "rating", type: "integer", description: "Minimum rating (1–5)" },
      { name: "stock", type: "string", description: "1 = in stock only" },
      { name: "halal", type: "string", description: "1 = halal certified only" },
      { name: "uz", type: "string", description: "1 = Made in Uzbekistan only" },
      { name: "shop", type: "string", description: "Shop slug" },
      { name: "sort", type: "string", description: "Sort order", enum: ["popular", "price_asc", "price_desc", "rating", "new", "discount"] },
      { name: "page", type: "integer", description: "Page number, from 1" },
      { name: "pageSize", type: "integer", description: "Items per page (default 24)" },
      { name: "locale", type: "string", description: "Response language", enum: ["uz", "uz-Cyrl", "ru"] },
    ],
    example: { items: [{ id: "cm…", slug: "kuk-choy-95", title: "Ko‘k choy №95, 100 g", price: 18000, oldPrice: null, rating: 4.3, reviewCount: 10, inStock: true }], total: 1, page: 1, pageSize: 24 },
  },
  { id: "compareProducts", method: "GET", path: "/api/v1/products/compare", group: "catalog", summary: "Cards and merged specification rows for up to 4 products", query: [{ name: "ids", type: "string", description: "Comma-separated product ids" }, { name: "locale", type: "string", description: "Response language", enum: ["uz", "uz-Cyrl", "ru"] }] },
  { id: "suggest", method: "GET", path: "/api/v1/search/suggest", group: "catalog", summary: "Search autocomplete: products, categories, brands and trending queries", query: [{ name: "q", type: "string", description: "What the user typed so far" }, { name: "locale", type: "string", description: "Response language", enum: ["uz", "uz-Cyrl", "ru"] }] },
  {
    id: "sellerProducts",
    method: "GET",
    path: "/api/seller/v1/products",
    group: "seller",
    scope: "products:read",
    summary: "Your products with variants, SKUs, prices and stock",
    query: [...page, { name: "updated_since", type: "date-time", description: "Only products changed since this time (ISO 8601)" }],
    example: { data: { items: [{ id: "cm…", slug: "smart-soat", title_uz: "Aqlli soat", status: "ACTIVE", fulfillment: "FBS", variants: [{ sku: "TH-001", price: 1290000, stock: 14 }] }], page: 1, per_page: 50, total: 1 } },
  },
  { id: "sellerSku", method: "GET", path: "/api/seller/v1/products/{sku}", group: "seller", scope: "products:read", summary: "One variant by SKU" },
  { id: "sellerStock", method: "PUT", path: "/api/seller/v1/products/{sku}/stock", group: "seller", scope: "products:write", summary: "Set seller-warehouse stock for a SKU (FBS/DBS)", body: { quantity: 12 } },
  { id: "sellerPrice", method: "PUT", path: "/api/seller/v1/products/{sku}/price", group: "seller", scope: "products:write", summary: "Set price and optional crossed-out price (integers, so‘m)", body: { price: 1290000, old_price: 1490000 } },
  { id: "sellerBulkStock", method: "POST", path: "/api/seller/v1/stock", group: "seller", scope: "products:write", summary: "Set stock for up to 500 SKUs in one call", body: { items: [{ sku: "TH-001", quantity: 5 }] } },
  {
    id: "sellerOrders",
    method: "GET",
    path: "/api/seller/v1/orders",
    group: "seller",
    scope: "orders:read",
    summary: "Your orders, newest first",
    query: [...page, { name: "status", type: "string", description: "Filter by status", enum: ["PLACED", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"] }, { name: "since", type: "date-time", description: "Only orders created since this time" }],
  },
  { id: "sellerOrder", method: "GET", path: "/api/seller/v1/orders/{number}", group: "seller", scope: "orders:read", summary: "One order by number (delivery address only for DBS orders)" },
  { id: "sellerOrderStatus", method: "POST", path: "/api/seller/v1/orders/{number}/status", group: "seller", scope: "orders:write", summary: "Move an order forward: CONFIRMED → PACKED → SHIPPED", body: { status: "CONFIRMED" } },
  { id: "health", method: "GET", path: "/api/health", group: "system", summary: "Liveness and readiness: database, jobs, storage", example: { status: "ok", checks: { database: { ok: true, ms: 3 } } } },
];

export const ERROR_CODES = [
  ["401", "unauthorized", "Missing, malformed, invalid or revoked API key"],
  ["403", "insufficient_scope", "The key lacks the scope this endpoint needs"],
  ["404", "notFound", "No such SKU or order in your shop"],
  ["409", "invalidTransition", "Status change not allowed from the current status"],
  ["422", "validation_failed", "Body or query failed validation (details lists the fields)"],
  ["429", "rate_limited", "Too many requests; wait Retry-After seconds"],
  ["500", "internal", "Unexpected error (reported to monitoring)"],
] as const;

const schemaOf = (v: unknown): Record<string, unknown> => {
  if (Array.isArray(v)) return { type: "array", items: v.length ? schemaOf(v[0]) : {} };
  if (v && typeof v === "object") return { type: "object", properties: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, schemaOf(x)])) };
  if (typeof v === "number") return { type: Number.isInteger(v) ? "integer" : "number" };
  if (typeof v === "boolean") return { type: "boolean" };
  return { type: "string" };
};

export function openApiDocument(baseUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const params = [
      ...(e.path.match(/\{(\w+)\}/g) ?? []).map((p) => ({ name: p.slice(1, -1), in: "path", required: true, schema: { type: "string" } })),
      ...(e.query ?? []).map((q) => ({ name: q.name, in: "query", required: false, description: q.description, schema: q.type === "date-time" ? { type: "string", format: "date-time" } : { type: q.type, ...(q.enum ? { enum: q.enum } : {}) } })),
    ];
    paths[e.path] ??= {};
    paths[e.path][e.method.toLowerCase()] = {
      operationId: e.id,
      summary: e.summary,
      tags: [e.group],
      ...(e.scope ? { security: [{ bearer: [e.scope] }] } : { security: [] }),
      ...(params.length ? { parameters: params } : {}),
      ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: schemaOf(e.body), example: e.body } } } } : {}),
      responses: {
        "200": { description: "OK", content: { "application/json": e.example ? { example: e.example } : {} } },
        ...(e.group === "seller" ? Object.fromEntries(ERROR_CODES.map(([status, code, text]) => [status, { description: `${code}: ${text}`, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }])) : {}),
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "ANOR API", version: "1.0.0", description: "Public catalog API and the seller API. Seller endpoints need an API key created in the seller cabinet (Sozlamalar → API). Amounts are integers in so‘m." },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "catalog", description: "Public, no key, cached" },
      { name: "seller", description: "Bearer API key, per-key rate limit" },
      { name: "system", description: "Monitoring" },
    ],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Seller API key (anr_live_…)" } },
      schemas: { Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} }, required: ["code", "message"] } } } },
    },
    paths,
  };
}
