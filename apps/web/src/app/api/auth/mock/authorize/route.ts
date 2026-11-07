import { connection, type NextRequest } from "next/server";
import { loadConfig } from "@/server/config";
import { isAllowedRedirect, mockEnabled } from "@/server/oauth/mock";
import { isProviderId, PROVIDER_LABELS } from "@/server/oauth/providers";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** GET /api/auth/mock/authorize — fake consent screen (local dev only). */
export async function GET(req: NextRequest) {
  await connection();
  const config = loadConfig();
  if (!mockEnabled(config)) return new Response("Not found", { status: 404 });

  const q = req.nextUrl.searchParams;
  const provider = q.get("provider");
  if (!isProviderId(provider) || !isAllowedRedirect(config, q.get("redirect_uri"))) {
    return new Response("Bad request", { status: 400 });
  }
  const hidden = ["provider", "redirect_uri", "state", "scope", "code_challenge"]
    .map((k) => `<input type="hidden" name="${k}" value="${esc(q.get(k) ?? "")}">`)
    .join("");
  const label = PROVIDER_LABELS[provider];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock ${label} sign-in</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 16px;color:#111;background:#fff}
@media (prefers-color-scheme:dark){body{color:#eee;background:#111}input{background:#222;color:#eee}}
input[type=email]{width:100%;padding:.5rem;margin:.5rem 0 1rem;font-size:1rem;box-sizing:border-box}
button{padding:.5rem 1rem;font-size:1rem;margin-right:.5rem;cursor:pointer}.note{font-size:.85rem;opacity:.7}</style></head>
<body><h1>Mock ${label} sign-in</h1><p class="note">Local development only. No real account is used.</p>
<form method="get" action="/api/auth/mock/approve">${hidden}
<label for="email">Email</label><input id="email" name="email" type="email" required value="me@${provider === "google" ? "gmail.com" : "outlook.com"}">
<button type="submit" name="decision" value="allow">Allow</button><button type="submit" name="decision" value="deny" formnovalidate>Deny</button>
</form></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
