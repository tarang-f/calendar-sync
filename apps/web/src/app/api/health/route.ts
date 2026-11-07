import { connection } from "next/server";

/** Phase 0 smoke test: GET /api/health → {"status":"ok"}. */
export async function GET() {
  await connection(); // always evaluate at request time, never prerender
  return Response.json({
    status: "ok",
    service: "calendar-sync-web",
    time: new Date().toISOString(),
  });
}
