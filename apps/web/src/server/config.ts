/** Runtime configuration, read from environment variables. Pure: safe to unit-test. */
export interface AppConfig {
  /** Public base URL of the web app, no trailing slash. Used to build OAuth redirect URIs. */
  appUrl: string;
  isProduction: boolean;
  /** Local-only fake OAuth provider. Never enabled in production. */
  oauthMock: boolean;
  google: { clientId: string; clientSecret: string };
  microsoft: { clientId: string; clientSecret: string };
  /** Firebase Web API key (public). Used to exchange custom tokens for ID tokens. */
  firebaseApiKey: string;
  /** Firebase Auth emulator host, e.g. 127.0.0.1:9099. */
  authEmulatorHost?: string;
  /** Full Cloud KMS key name. Required in production. */
  kmsKeyName?: string;
  /** Base64 32-byte key for local (non-production) token encryption. */
  localTokenKey?: string;
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): AppConfig {
  const appEnv = env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : "development");
  const isProduction = appEnv === "production";
  const oauthMock = env.OAUTH_MOCK === "1" && !isProduction;
  const mockId = oauthMock ? "mock-client" : "";
  const mockSecret = oauthMock ? "mock-secret" : "";

  return {
    appUrl: (env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    isProduction,
    oauthMock,
    google: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? mockId,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? mockSecret,
    },
    microsoft: {
      clientId: env.MICROSOFT_OAUTH_CLIENT_ID ?? mockId,
      clientSecret: env.MICROSOFT_OAUTH_CLIENT_SECRET ?? mockSecret,
    },
    firebaseApiKey: env.FIREBASE_API_KEY ?? "",
    authEmulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST || undefined,
    kmsKeyName: env.KMS_KEY_NAME || undefined,
    localTokenKey: env.TOKEN_ENC_KEY || undefined,
  };
}
