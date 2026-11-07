import { AppError } from "../errors";
import type { FetchLike } from "../oauth/providers";

/** GET a provider API with a bearer token, mapping auth failures to needs_reauth. */
export async function getJson(fetchImpl: FetchLike, url: string, accessToken: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  } catch (e) {
    throw new AppError("provider_unavailable", `GET ${url} failed: ${(e as Error).message}`);
  }
  if (res.status === 401) throw new AppError("needs_reauth", `GET ${url}: 401`);
  if (!res.ok) throw new AppError("provider_unavailable", `GET ${url}: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}
