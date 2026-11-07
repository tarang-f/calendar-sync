import { describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { listGoogleCalendars } from "@/server/providers/google";
import { listMicrosoftCalendars } from "@/server/providers/microsoft";
import { providerSpec, refreshAccessToken } from "@/server/oauth/providers";
import { listCalendars } from "@/server/providers";
import { testConfig } from "./helpers";

const json = (body: object, status = 200) => Response.json(body, { status });

describe("Google calendar list", () => {
  it("follows pages and maps access roles", async () => {
    const pages = [
      { items: [{ id: "a", summary: "A", accessRole: "owner", primary: true }, { id: "gone", deleted: true }], nextPageToken: "p2" },
      { items: [{ id: "b", summary: "B", summaryOverride: "Bee", accessRole: "reader" }, { id: "c", summary: "C", accessRole: "writer" }] },
    ];
    const urls: string[] = [];
    const cals = await listGoogleCalendars(async (u) => (urls.push(u), json(pages.shift()!)), "https://g", "tok");
    expect(cals).toEqual([
      { providerCalendarId: "a", name: "A", canWrite: true, isPrimary: true, color: undefined },
      { providerCalendarId: "b", name: "Bee", canWrite: false, isPrimary: false, color: undefined },
      { providerCalendarId: "c", name: "C", canWrite: true, isPrimary: false, color: undefined },
    ]);
    expect(new URL(urls[1]).searchParams.get("pageToken")).toBe("p2");
  });

  it("maps 401 to needs_reauth", async () => {
    await expect(listGoogleCalendars(async () => json({}, 401), "https://g", "t")).rejects.toMatchObject({ code: "needs_reauth" });
  });

  it("maps 5xx to provider_unavailable", async () => {
    await expect(listGoogleCalendars(async () => json({}, 503), "https://g", "t")).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});

describe("Microsoft calendar list", () => {
  it("follows nextLink on the same host only", async () => {
    const pages = [
      { value: [{ id: "x", name: "Calendar", canEdit: true, isDefaultCalendar: true }], "@odata.nextLink": "https://graph/v1.0/me/calendars?$skip=1" },
      { value: [{ id: "y", name: "Birthdays", canEdit: false }], "@odata.nextLink": "https://evil/steal" },
    ];
    const urls: string[] = [];
    const cals = await listMicrosoftCalendars(async (u) => (urls.push(u), json(pages.shift()!)), "https://graph", "tok");
    expect(cals.map((c) => [c.name, c.canWrite, c.isPrimary])).toEqual([["Calendar", true, true], ["Birthdays", false, false]]);
    expect(urls).toHaveLength(2);
  });
});

describe("listCalendars", () => {
  it("sorts primary first, then by name", async () => {
    const f = async () => json({ items: [{ id: "z", summary: "Zed", accessRole: "owner" }, { id: "p", summary: "Primary", primary: true, accessRole: "owner" }, { id: "a", summary: "Alpha", accessRole: "owner" }] });
    expect((await listCalendars(testConfig(), "google", "t", f)).map((c) => c.name)).toEqual(["Primary", "Alpha", "Zed"]);
  });
});

describe("refreshAccessToken", () => {
  const spec = providerSpec("microsoft", testConfig());
  it("returns a rotated refresh token when present", async () => {
    const r = await refreshAccessToken(spec, "old", async () => json({ access_token: "a", expires_in: 100, refresh_token: "new" }));
    expect(r).toEqual({ accessToken: "a", expiresIn: 100, refreshToken: "new" });
  });
  it("maps invalid_grant to needs_reauth", async () => {
    await expect(refreshAccessToken(spec, "old", async () => json({ error: "invalid_grant" }, 400))).rejects.toMatchObject({ code: "needs_reauth" });
  });
  it("maps other failures to provider_unavailable", async () => {
    const err = await refreshAccessToken(spec, "old", async () => json({ error: "temporarily_unavailable" }, 503)).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("provider_unavailable");
  });
});
