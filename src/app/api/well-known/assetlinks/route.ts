import { NextResponse } from "next/server";
import { env } from "@/server/env";

/** /.well-known/assetlinks.json — Android App Links for a future native app (empty until configured). */
export function GET() {
  const e = env();
  const fingerprints = (e.ANDROID_APP_SHA256 ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const body = e.ANDROID_APP_PACKAGE && fingerprints.length ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: e.ANDROID_APP_PACKAGE, sha256_cert_fingerprints: fingerprints } }] : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
