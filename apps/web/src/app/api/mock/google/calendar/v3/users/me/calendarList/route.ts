import { connection } from "next/server";
import { loadConfig } from "@/server/config";
import { mockCaller, mockEnabled, mockGoogleCalendarList } from "@/server/oauth/mock";

/** Mock Google Calendar API: GET calendar/v3/users/me/calendarList (local dev only). */
export async function GET(req: Request) {
  await connection();
  if (!mockEnabled(loadConfig())) return new Response("Not found", { status: 404 });
  const caller = mockCaller(req.headers.get("authorization"), "google");
  if (!caller) return Response.json({ error: { code: 401, message: "Invalid Credentials" } }, { status: 401 });
  return Response.json(mockGoogleCalendarList(caller.e));
}
