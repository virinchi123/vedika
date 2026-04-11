import type { RequestHandler } from "express";

import { asyncHandler } from "../lib/async-handler.js";
import { getAuthenticatedUser } from "./auth.service.js";
import { HttpError } from "./http-error.js";
import { verifyAccessToken } from "./tokens.js";

const extractBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader) {
    throw new HttpError(401, "Invalid or missing access token.");
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "Invalid or missing access token.");
  }

  return token;
};

export const requireAuth: RequestHandler = asyncHandler(async (request, _response, next) => {
  const accessToken = extractBearerToken(request.header("authorization"));

  try {
    const payload = await verifyAccessToken(accessToken);

    request.user = await getAuthenticatedUser({
      sessionId: payload.sessionId,
      userId: payload.userId,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(401, "Invalid or expired access token.");
  }

  next();
});
