import assert from "node:assert/strict";
import { after, beforeEach } from "node:test";

import request from "supertest";

import { resetAuthRateLimit } from "../src/auth/auth.router.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

export const api = request(app);
export const defaultPassword = "password123";

let hasValidatedTestDatabase = false;

type RegistrationPayloadOverrides = Partial<{
  emailAddress: string;
  password: string;
  deviceName: string;
}>;

export const buildRegistrationPayload = (
  overrides: RegistrationPayloadOverrides = {},
) => ({
  emailAddress: "person@example.com",
  password: defaultPassword,
  deviceName: "Pixel 9",
  ...overrides,
});

export const assertSafeTestDatabase = async (): Promise<void> => {
  if (hasValidatedTestDatabase) {
    return;
  }

  if (process.env.NODE_ENV !== "test") {
    throw new Error("Refusing to run integration test cleanup outside NODE_ENV=test.");
  }

  const result = await prisma.$queryRaw<Array<{ current_database: string; current_schema: string }>>`
    SELECT current_database() AS current_database, current_schema() AS current_schema
  `;
  const activeDatabase = result[0]?.current_database?.toLowerCase() ?? "";
  const activeSchema = result[0]?.current_schema?.toLowerCase() ?? "";

  if (!activeDatabase.includes("test") && !activeSchema.includes("test")) {
    throw new Error(
      `Refusing to wipe database "${activeDatabase || "unknown"}" on schema "${activeSchema || "unknown"}". Configure a dedicated test database first.`,
    );
  }

  hasValidatedTestDatabase = true;
};

const isMissingEventBookingTableError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
};

const deleteEventBookingsIfTableExists = async () => {
  try {
    await prisma.eventBooking.deleteMany();
  } catch (error) {
    if (isMissingEventBookingTableError(error)) {
      return;
    }

    throw error;
  }
};

export const resetDatabase = async () => {
  await assertSafeTestDatabase();
  await deleteEventBookingsIfTableExists();
  await prisma.bookingStatus.deleteMany();
  await prisma.defaultBookingConfiguration.deleteMany();
  await prisma.eventStatus.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.eventType.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
};

export const registerAndAuthenticate = async (
  registrationPayload = buildRegistrationPayload(),
): Promise<string> => {
  const registration = await api.post("/auth/register").send(registrationPayload);

  assert.equal(registration.status, 201);

  return registration.body.accessToken as string;
};

export const setupIntegrationTestLifecycle = () => {
  beforeEach(async () => {
    resetAuthRateLimit();
    await resetDatabase();
  });

  after(async () => {
    resetAuthRateLimit();
    await resetDatabase();
    await prisma.$disconnect();
  });
};
