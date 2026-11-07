import { randomBytes } from "node:crypto";
import { MemoryAccountRepo } from "@/server/accounts/memoryRepo";
import type { FlowDeps } from "@/server/auth/flow";
import { loadConfig } from "@/server/config";
import { LocalTokenCipher } from "@/server/crypto/tokenCipher";
import { mockTokenResponse } from "@/server/oauth/mock";

export const testConfig = (over: Record<string, string> = {}) =>
  loadConfig({ APP_URL: "http://localhost:3000", OAUTH_MOCK: "1", NODE_ENV: "test", ...over });

/** fetch() that answers the mock token endpoint in-process. */
export const mockFetch: FlowDeps["fetch"] = async (url, init) => {
  if (!url.endsWith("/api/auth/mock/token")) throw new Error(`unexpected fetch ${url}`);
  const [status, json] = mockTokenResponse(new URLSearchParams(String(init?.body)));
  return Response.json(json, { status });
};

export function makeDeps(over: Partial<FlowDeps> = {}): FlowDeps & { repo: MemoryAccountRepo } {
  return {
    config: testConfig(),
    repo: new MemoryAccountRepo(),
    cipher: new LocalTokenCipher(randomBytes(32).toString("base64")),
    fetch: mockFetch,
    now: () => 1_700_000_000_000,
    ...over,
  } as FlowDeps & { repo: MemoryAccountRepo };
}
