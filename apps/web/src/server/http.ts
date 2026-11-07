import { NextResponse } from "next/server";
import type { AppConfig } from "./config";

/** Rejects cross-site form posts (defence in depth on top of SameSite=Lax cookies). */
export function isSameOrigin(req: Request, cfg: AppConfig): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  return origin === new URL(cfg.appUrl).origin;
}

/** 303 redirect to a path on this app. Set cookies on the returned response. */
export function redirectTo(cfg: AppConfig, path: string, params?: Record<string, string>): NextResponse {
  const url = new URL(path, cfg.appUrl);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}
