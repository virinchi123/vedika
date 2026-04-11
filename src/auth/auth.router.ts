import { Router } from "express";

import { appConfig } from "../config/app.js";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "./auth.middleware.js";
import { loginUser, refreshAuthSession, registerUser, revokeAuthSession, serializeUser } from "./auth.service.js";
import {
  parseEmailAddress,
  parseOptionalString,
  parsePassword,
  parseRefreshToken,
} from "./auth.validation.js";
import { createRateLimitMiddleware } from "./rate-limit.js";

export const authRouter = Router();

const authRateLimit = createRateLimitMiddleware({
  windowMs: appConfig.authRateLimitWindowMs,
  maxRequests: appConfig.authRateLimitMaxRequests,
});

export const resetAuthRateLimit = (): void => {
  authRateLimit.reset();
};

authRouter.post(
  "/register",
  authRateLimit,
  asyncHandler(async (request, response) => {
    const result = await registerUser({
      emailAddress: parseEmailAddress(request.body?.emailAddress),
      password: parsePassword(request.body?.password),
      deviceName: parseOptionalString(request.body?.deviceName, {
        fieldName: "deviceName",
        maxLength: 120,
      }),
    });

    response.status(201).json(result);
  }),
);

authRouter.post(
  "/login",
  authRateLimit,
  asyncHandler(async (request, response) => {
    const result = await loginUser({
      emailAddress: parseEmailAddress(request.body?.emailAddress),
      password: parsePassword(request.body?.password),
      deviceName: parseOptionalString(request.body?.deviceName, {
        fieldName: "deviceName",
        maxLength: 120,
      }),
    });

    response.status(200).json(result);
  }),
);

authRouter.post(
  "/refresh",
  authRateLimit,
  asyncHandler(async (request, response) => {
    const result = await refreshAuthSession({
      refreshToken: parseRefreshToken(request.body?.refreshToken),
      deviceName: parseOptionalString(request.body?.deviceName, {
        fieldName: "deviceName",
        maxLength: 120,
      }),
    });

    response.status(200).json(result);
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (request, response) => {
    await revokeAuthSession(parseRefreshToken(request.body?.refreshToken));
    response.status(204).send();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (request, response) => {
    response.status(200).json({
      user: serializeUser(request.user!),
    });
  }),
);
