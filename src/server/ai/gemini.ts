import "server-only";
import { env } from "@/server/env";
import { log } from "@/server/log";

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

export function aiEnabled(): boolean {
  return !!env().GEMINI_API_KEY;
}

async function call(model: string, parts: Part[], opts: { json?: boolean; system?: string; temperature?: number }) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env().GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      ...(opts.system ? { system_instruction: { parts: [{ text: opts.system }] } } : {}),
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: opts.temperature ?? 0.3, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`gemini ${model} ${res.status}`);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

/** Generate text with the primary model, retrying on the fallback model. Returns null when AI is off or both fail. */
export async function generate(parts: Part[], opts: { json?: boolean; system?: string; temperature?: number } = {}): Promise<string | null> {
  if (!aiEnabled()) return null;
  const e = env();
  for (const model of [e.GEMINI_MODEL, e.GEMINI_FALLBACK_MODEL]) {
    try {
      return await call(model, parts, opts);
    } catch (err) {
      log.warn("gemini call failed", { model, err });
    }
  }
  return null;
}

export async function generateJson<T>(parts: Part[], opts: { system?: string } = {}): Promise<T | null> {
  const text = await generate(parts, { ...opts, json: true });
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/^```json\s*|```$/g, "")) as T;
  } catch {
    return null;
  }
}
