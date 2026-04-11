import type { RequestHandler } from "express";

import { HttpError } from "./http-error.js";

type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

export const createRateLimitMiddleware = ({
  windowMs,
  maxRequests,
}: {
  windowMs: number;
  maxRequests: number;
}): RequestHandler => {
  const entries = new Map<string, RateLimitEntry>();

  return (request, _response, next) => {
    const now = Date.now();

    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
      }
    }

    const key = `${request.path}:${request.ip ?? request.socket.remoteAddress ?? "unknown"}`;
    const entry = entries.get(key);

    if (!entry || entry.expiresAt <= now) {
      entries.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      next(new HttpError(429, "Too many authentication attempts. Please try again later."));
      return;
    }

    entry.count += 1;
    next();
  };
};
