import { describe, expect, it, vi } from "vitest";
import { healthHandler } from "../src/health.js";

describe("healthHandler", () => {
  it("returns 200 with status ok", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    healthHandler({ method: "GET" }, { status, json } as never);
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toMatchObject({ status: "ok", service: "calendar-sync-functions" });
  });
});
