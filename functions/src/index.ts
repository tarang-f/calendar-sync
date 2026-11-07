import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/https";
import { REGION } from "./config.js";
import { healthHandler } from "./health.js";

setGlobalOptions({ region: REGION, maxInstances: 10 });

/** Phase 0 smoke test: GET /health → {"status":"ok"}. */
export const health = onRequest({ cors: false }, healthHandler);
