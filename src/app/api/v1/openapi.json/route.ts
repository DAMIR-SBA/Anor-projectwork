import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { openApiDocument } from "@/lib/openapi";

/** GET /api/v1/openapi.json — OpenAPI 3.1 description of the public and seller APIs. */
export function GET() {
  return NextResponse.json(openApiDocument(env().APP_URL.replace(/\/$/, "")), { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
}
