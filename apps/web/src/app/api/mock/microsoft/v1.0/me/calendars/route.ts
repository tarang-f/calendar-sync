import { connection } from "next/server";
import { loadConfig } from "@/server/config";
import { mockCaller, mockEnabled, mockGraphCalendars } from "@/server/oauth/mock";

/** Mock Microsoft Graph: GET v1.0/me/calendars (local dev only). */
export async function GET(req: Request) {
  await connection();
  if (!mockEnabled(loadConfig())) return new Response("Not found", { status: 404 });
  const caller = mockCaller(req.headers.get("authorization"), "microsoft");
  if (!caller) return Response.json({ error: { code: "InvalidAuthenticationToken" } }, { status: 401 });
  return Response.json(mockGraphCalendars(caller.e));
}
