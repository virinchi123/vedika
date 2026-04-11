import { runtimeConfig } from "./runtime.js";

export const appConfig = {
  nodeEnv: runtimeConfig.nodeEnv as string,
  port: runtimeConfig.app.port,
  jwtSecret: runtimeConfig.auth.jwtSecret,
  accessTokenTtlMinutes: runtimeConfig.auth.accessTokenTtlMinutes,
  refreshTokenTtlDays: runtimeConfig.auth.refreshTokenTtlDays,
  authRateLimitWindowMs: runtimeConfig.auth.rateLimitWindowMs,
  authRateLimitMaxRequests: runtimeConfig.auth.rateLimitMaxRequests,
} as const;
