"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { generateJson } from "@/server/ai/gemini";
import { rateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Image search: Gemini describes the photo as search keywords; without AI, keywords come from the file name. */
export async function imageSearchAction(formData: FormData) {
  const locale = await getLocale();
  const meta = await requestMeta();
  const rl = await rateLimit(`imgsearch:${meta.ip}`, 10, 300);
  const file = formData.get("image");
  if (!rl.success || !(file instanceof File) || !IMAGE_TYPES.includes(file.type) || file.size > 5 * 1024 * 1024) {
    redirect({ href: "/search/image?error=1", locale });
    return;
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ai = await generateJson<{ query: string }>(
    [
      { text: 'Describe the main product in this photo as a short marketplace search query in Uzbek Latin (2-4 words, e.g. "qizil ko\'ylak", "simsiz quloqchin"). Reply as JSON {"query": "..."}' },
      { inline_data: { mime_type: file.type, data: buf.toString("base64") } },
    ],
  );
  const fromName = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.\d]+/g, " ").trim();
  const q = ai?.query?.trim() || fromName || "";
  redirect({ href: q ? `/search?q=${encodeURIComponent(q)}&via=image${ai ? "" : "&fallback=1"}` : "/search/image?error=1", locale });
}
