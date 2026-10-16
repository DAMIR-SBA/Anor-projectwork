import { NextResponse } from "next/server";
import { env } from "@/server/env";

/** /.well-known/apple-app-site-association — iOS Universal Links for a future native app. */
export function GET() {
  const appId = env().IOS_APP_ID;
  const body = { applinks: { details: appId ? [{ appIDs: [appId], components: [{ "/": "/p/*" }, { "/": "/c/*" }, { "/": "/shop/*" }, { "/": "/live/*" }, { "/": "/account/orders/*" }, { "/": "/open" }] }] : [] } };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
