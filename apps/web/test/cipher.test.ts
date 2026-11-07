import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KmsTokenCipher, LocalTokenCipher, createTokenCipher, type KmsLike } from "@/server/crypto/tokenCipher";
import { testConfig } from "./helpers";

describe("LocalTokenCipher", () => {
  const c = new LocalTokenCipher(randomBytes(32).toString("base64"));

  it("round-trips and never stores plaintext", async () => {
    const enc = await c.encrypt("refresh-123", "u/a");
    expect(enc).not.toContain("refresh-123");
    expect(await c.decrypt(enc, "u/a")).toBe("refresh-123");
  });

  it("refuses a ciphertext moved to another account", async () => {
    const enc = await c.encrypt("refresh-123", "u1/a");
    await expect(c.decrypt(enc, "u2/a")).rejects.toThrow();
  });

  it("detects tampering", async () => {
    const enc = await c.encrypt("refresh-123", "u/a");
    const bad = enc.slice(0, -2) + (enc.endsWith("A") ? "B" : "A") + enc.slice(-1);
    await expect(c.decrypt(bad, "u/a")).rejects.toThrow();
  });

  it("rejects wrong key sizes", () => {
    expect(() => new LocalTokenCipher(Buffer.alloc(16).toString("base64"))).toThrow();
  });
});

describe("KmsTokenCipher", () => {
  it("passes key name and AAD to KMS", async () => {
    const calls: unknown[] = [];
    const kms: KmsLike = {
      encrypt: async (r) => (calls.push(r), [{ ciphertext: Buffer.concat([Buffer.from("E:"), r.plaintext]) }]),
      decrypt: async (r) => (calls.push(r), [{ plaintext: r.ciphertext.subarray(2) }]),
    };
    const c = new KmsTokenCipher(kms, "projects/p/locations/l/keyRings/k/cryptoKeys/t");
    const enc = await c.encrypt("tok", "u/a");
    expect(enc.startsWith("kms:v1:")).toBe(true);
    expect(await c.decrypt(enc, "u/a")).toBe("tok");
    expect(calls[0]).toMatchObject({ name: "projects/p/locations/l/keyRings/k/cryptoKeys/t", additionalAuthenticatedData: Buffer.from("u/a") });
  });
});

describe("createTokenCipher", () => {
  it("requires KMS in production", async () => {
    await expect(createTokenCipher(testConfig({ APP_ENV: "production" }))).rejects.toThrow(/KMS_KEY_NAME/);
  });
});
