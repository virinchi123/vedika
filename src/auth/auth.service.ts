import { Prisma } from "../generated/prisma/client.js";

import { appConfig } from "../config/app.js";
import { findUniqueConstraintMessage } from "../lib/prisma-errors.js";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedRequestUser, PublicUser } from "./auth.types.js";
import { HttpError } from "./http-error.js";
import { hashPassword, verifyPassword } from "./password.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "./tokens.js";

const publicUserSelect = {
  id: true,
  emailAddress: true,
  phoneNumber: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const loginUserSelect = {
  ...publicUserSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

type LoginUser = Prisma.UserGetPayload<{
  select: typeof loginUserSelect;
}>;

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: PublicUser;
};

const refreshTokenTtlMs = appConfig.refreshTokenTtlDays * 24 * 60 * 60 * 1000;

const buildRefreshTokenExpiry = (): Date => {
  return new Date(Date.now() + refreshTokenTtlMs);
};

const toPublicUser = (user: LoginUser | PublicUser): PublicUser => {
  return {
    id: user.id,
    emailAddress: user.emailAddress,
    phoneNumber: user.phoneNumber,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const issueSessionForUser = async (
  transactionClient: Prisma.TransactionClient,
  userId: string,
  deviceName: string | null,
): Promise<{
  sessionId: string;
  refreshToken: string;
}> => {
  const refreshToken = generateRefreshToken();
  const session = await transactionClient.session.create({
    data: {
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      deviceName,
      expiresAt: buildRefreshTokenExpiry(),
    },
    select: {
      id: true,
    },
  });

  return {
    sessionId: session.id,
    refreshToken,
  };
};

const buildAuthResponse = async ({
  user,
  sessionId,
  refreshToken,
}: {
  user: PublicUser;
  sessionId: string;
  refreshToken: string;
}): Promise<AuthResponse> => {
  return {
    accessToken: await signAccessToken({
      userId: user.id,
      sessionId,
    }),
    refreshToken,
    user,
  };
};

const registerUserConflictMessages = {
  emailAddress: "An account with that email already exists.",
} as const;

export const registerUser = async ({
  emailAddress,
  password,
  deviceName,
}: {
  emailAddress: string;
  password: string;
  deviceName: string | null;
}): Promise<AuthResponse> => {
  const passwordHash = await hashPassword(password);

  try {
    const result = await prisma.$transaction(async (transactionClient) => {
      const user = await transactionClient.user.create({
        data: {
          emailAddress,
          passwordHash,
        },
        select: publicUserSelect,
      });
      const session = await issueSessionForUser(transactionClient, user.id, deviceName);

      return {
        user,
        ...session,
      };
    });

    return buildAuthResponse(result);
  } catch (error) {
    const conflictMessage = findUniqueConstraintMessage(error, registerUserConflictMessages);
    if (conflictMessage !== null) {
      throw new HttpError(409, conflictMessage);
    }

    throw error;
  }
};

export const loginUser = async ({
  emailAddress,
  password,
  deviceName,
}: {
  emailAddress: string;
  password: string;
  deviceName: string | null;
}): Promise<AuthResponse> => {
  const user = await prisma.user.findUnique({
    where: {
      emailAddress,
    },
    select: loginUserSelect,
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password.");
  }

  const session = await prisma.$transaction((transactionClient) => {
    return issueSessionForUser(transactionClient, user.id, deviceName);
  });

  return buildAuthResponse({
    user: toPublicUser(user),
    ...session,
  });
};

const loadSessionByRefreshToken = async (refreshToken: string): Promise<SessionRecord | null> => {
  return prisma.session.findUnique({
    where: {
      refreshTokenHash: hashRefreshToken(refreshToken),
    },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: publicUserSelect,
      },
    },
  });
};

const assertSessionIsActive = (session: SessionRecord | null, invalidMessage: string): SessionRecord => {
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, invalidMessage);
  }

  return session;
};

export const refreshAuthSession = async ({
  refreshToken,
  deviceName,
}: {
  refreshToken: string;
  deviceName: string | null;
}): Promise<AuthResponse> => {
  const session = assertSessionIsActive(await loadSessionByRefreshToken(refreshToken), "Invalid refresh token.");
  const nextRefreshToken = generateRefreshToken();

  await prisma.session.update({
    where: {
      id: session.id,
    },
    data: {
      refreshTokenHash: hashRefreshToken(nextRefreshToken),
      deviceName: deviceName ?? undefined,
      expiresAt: buildRefreshTokenExpiry(),
    },
  });

  return buildAuthResponse({
    user: session.user,
    sessionId: session.id,
    refreshToken: nextRefreshToken,
  });
};

export const revokeAuthSession = async (refreshToken: string): Promise<void> => {
  await prisma.session.updateMany({
    where: {
      refreshTokenHash: hashRefreshToken(refreshToken),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

export const getAuthenticatedUser = async ({
  sessionId,
  userId,
}: {
  sessionId: string;
  userId: string;
}): Promise<AuthenticatedRequestUser> => {
  const session = await prisma.session.findUnique({
    where: {
      id: sessionId,
    },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: publicUserSelect,
      },
    },
  });

  const activeSession = assertSessionIsActive(session, "Invalid or expired access token.");

  if (activeSession.userId !== userId) {
    throw new HttpError(401, "Invalid or expired access token.");
  }

  return {
    ...activeSession.user,
    sessionId: activeSession.id,
  };
};

export const serializeUser = (user: PublicUser): PublicUser => ({
  id: user.id,
  emailAddress: user.emailAddress,
  phoneNumber: user.phoneNumber,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
