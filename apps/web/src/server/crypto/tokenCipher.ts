import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AppConfig } from "../config";

/**
 * Encrypts OAuth refresh tokens at rest. `aad` binds a ciphertext to its owner
 * (e.g. "uid/accountId") so a token can't be copied onto another account.
 */
export interface TokenCipher {
  encrypt(plaintext: string, aad: string): Promise<string>;
  decrypt(ciphertext: string, aad: string): Promise<string>;
}

const LOCAL_PREFIX = "local:v1:";
const KMS_PREFIX = "kms:v1:";

/** AES-256-GCM with a key from env. Development and tests only. */
export class LocalTokenCipher implements TokenCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes, base64-encoded");
  }

  async encrypt(plaintext: string, aad: string): Promise<string> {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    c.setAAD(Buffer.from(aad, "utf8"));
    const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
    const tag = c.getAuthTag();
    return LOCAL_PREFIX + [iv, tag, ct].map((b) => b.toString("base64url")).join(".");
  }

  async decrypt(ciphertext: string, aad: string): Promise<string> {
    if (!ciphertext.startsWith(LOCAL_PREFIX)) throw new Error("not a local ciphertext");
    const [iv, tag, ct] = ciphertext.slice(LOCAL_PREFIX.length).split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !ct) throw new Error("malformed ciphertext");
    const d = createDecipheriv("aes-256-gcm", this.key, iv);
    d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  }
}

/** Minimal surface of @google-cloud/kms used here, so tests can fake it. */
export interface KmsLike {
  encrypt(req: { name: string; plaintext: Buffer; additionalAuthenticatedData: Buffer }): Promise<[{ ciphertext?: Uint8Array | string | null }, ...unknown[]]>;
  decrypt(req: { name: string; ciphertext: Buffer; additionalAuthenticatedData: Buffer }): Promise<[{ plaintext?: Uint8Array | string | null }, ...unknown[]]>;
}

/** Cloud KMS symmetric encryption. Production. */
export class KmsTokenCipher implements TokenCipher {
  constructor(
    private readonly client: KmsLike,
    private readonly keyName: string,
  ) {}

  async encrypt(plaintext: string, aad: string): Promise<string> {
    const [res] = await this.client.encrypt({
      name: this.keyName,
      plaintext: Buffer.from(plaintext, "utf8"),
      additionalAuthenticatedData: Buffer.from(aad, "utf8"),
    });
    if (!res.ciphertext) throw new Error("KMS returned no ciphertext");
    return KMS_PREFIX + Buffer.from(res.ciphertext as Uint8Array).toString("base64url");
  }

  async decrypt(ciphertext: string, aad: string): Promise<string> {
    if (!ciphertext.startsWith(KMS_PREFIX)) throw new Error("not a KMS ciphertext");
    const [res] = await this.client.decrypt({
      // Decrypt with the CryptoKey (not a version); KMS picks the right version.
      name: this.keyName,
      ciphertext: Buffer.from(ciphertext.slice(KMS_PREFIX.length), "base64url"),
      additionalAuthenticatedData: Buffer.from(aad, "utf8"),
    });
    if (!res.plaintext) throw new Error("KMS returned no plaintext");
    return Buffer.from(res.plaintext as Uint8Array).toString("utf8");
  }
}

export async function createTokenCipher(cfg: AppConfig): Promise<TokenCipher> {
  if (cfg.kmsKeyName) {
    const { KeyManagementServiceClient } = await import("@google-cloud/kms");
    return new KmsTokenCipher(new KeyManagementServiceClient() as unknown as KmsLike, cfg.kmsKeyName);
  }
  if (cfg.isProduction) throw new Error("KMS_KEY_NAME is required in production");
  if (!cfg.localTokenKey) throw new Error("Set TOKEN_ENC_KEY (32 bytes, base64) for local token encryption");
  return new LocalTokenCipher(cfg.localTokenKey);
}
