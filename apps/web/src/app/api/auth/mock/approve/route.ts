import { connection, NextResponse, type NextRequest } from "next/server";
import { loadConfig } from "@/server/config";
import { isAllowedRedirect, issueMockCode, mockEnabled } from "@/server/oauth/mock";
import { isProviderId } from "@/server/oauth/providers";

/** GET /api/auth/mock/approve — fake provider redirects back with a code (local dev only). */
export async function GET(req: NextRequest) {
  await connection();
  const config = loadConfig();
  if (!mockEnabled(config)) return new Response("Not found", { status: 404 });

  const q = req.nextUrl.searchParams;
  const provider = q.get("provider");
  const redirectUri = q.get("redirect_uri");
  if (!isProviderId(provider) || !isAllowedRedirect(config, redirectUri)) {
    return new Response("Bad request", { status: 400 });
  }
  const back = new URL(redirectUri);
  back.searchParams.set("state", q.get("state") ?? "");
  if (q.get("decision") !== "allow") {
    back.searchParams.set("error", "access_denied");
  } else {
    back.searchParams.set(
      "code",
      issueMockCode({
        provider,
        email: q.get("email") ?? "me@example.com",
        scope: q.get("scope") ?? "",
        codeChallenge: q.get("code_challenge") ?? "",
        redirectUri,
      }),
    );
  }
  return NextResponse.redirect(back, 302);
}
