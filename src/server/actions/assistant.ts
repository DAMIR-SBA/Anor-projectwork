"use server";

import { z } from "zod";
import { getLocale } from "next-intl/server";
import { action } from "@/server/action";
import { assistantReply } from "@/server/services/assistant";

const intent = z.object({ kind: z.enum(["search", "compare", "question", "greeting"]), query: z.string().max(80), category: z.string().max(60).nullable(), minPrice: z.number().optional(), maxPrice: z.number().optional(), features: z.array(z.string().max(30)).max(8), sort: z.enum(["price_asc", "price_desc", "rating", "popular"]).optional() });

export const askAssistantAction = action(
  {
    auth: "public",
    rateLimit: { key: "assistant", limit: 30, window: 600 },
    schema: z.object({
      message: z.string().trim().min(1).max(500),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1500) })).max(12).default([]),
      contextIds: z.array(z.string().max(40)).max(3).default([]),
      prev: intent.nullable().default(null),
    }),
  },
  async (i) => ({ ok: true, data: await assistantReply(i, await getLocale()) }),
);
