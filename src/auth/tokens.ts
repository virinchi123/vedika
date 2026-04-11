import { createHash, randomBytes } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import { appConfig } from "../config/app.js";
import { HttpError } from "./http-error.js";

const secretKey = new TextEncoder().encode(appConfig.jwtSecret);

type AccessTokenPayload = {
  sid: string;
  type: "access";
};

export const generateRefreshToken = (): string => randomBytes(32).toString("base64url");

export const hashRefreshToken = (refreshToken: string): string => {
  return createHash("sha256").update(refreshToken).digest("hex");
};

export const signAccessToken = async ({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}): Promise<string> => {
  return new SignJWT({
    sid: sessionId,
    type: "access",
  } satisfies AccessTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${appConfig.accessTokenTtlMinutes}m`)
    .sign(secretKey);
};

export const verifyAccessToken = async (
  token: string,
): Promise<{
  userId: string;
  sessionId: string;
}> => {
  const { payload } = await jwtVerify(token, secretKey);
  const userId = payload.sub;
  const sessionId = payload.sid;

  if (typeof userId !== "string" || typeof sessionId !== "string" || payload.type !== "access") {
    throw new HttpError(401, "Invalid or expired access token.");
  }

  return {
    userId,
    sessionId,
  };
};
