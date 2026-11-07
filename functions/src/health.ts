import type { Request, Response } from "express";

export interface HealthBody {
  status: "ok";
  service: "calendar-sync-functions";
  time: string;
}

/** Plain handler so it can be unit-tested without the Functions runtime. */
export function healthHandler(_req: Pick<Request, "method">, res: Pick<Response, "status" | "json">): void {
  const body: HealthBody = {
    status: "ok",
    service: "calendar-sync-functions",
    time: new Date().toISOString(),
  };
  res.status(200).json(body);
}
