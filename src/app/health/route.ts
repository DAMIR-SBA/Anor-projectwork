import { GET as health } from "../api/health/route";

export const dynamic = "force-dynamic";

/** GET /health — same report as /api/health, at the conventional path for load balancers. */
export const GET = health;
