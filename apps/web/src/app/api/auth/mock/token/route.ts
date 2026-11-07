import { connection } from "next/server";
import { loadConfig } from "@/server/config";
import { mockEnabled, mockTokenResponse } from "@/server/oauth/mock";

/** POST /api/auth/mock/token — fake token endpoint (local dev only). */
export async function POST(req: Request) {
  await connection();
  const config = loadConfig();
  if (!mockEnabled(config)) return new Response("Not found", { status: 404 });
  const [status, json] = mockTokenResponse(new URLSearchParams(await req.text()));
  return Response.json(json, { status });
}
