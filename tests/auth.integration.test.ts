import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import request from "supertest";

import { hashPassword } from "../src/auth/password.js";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const api = request(app);
const defaultPassword = "password123";
let hasValidatedTestDatabase = false;

const buildRegistrationPayload = () => ({
  emailAddress: " Person@Example.com ",
  password: defaultPassword,
  deviceName: "Pixel 9",
});

const assertSafeTestDatabase = async (): Promise<void> => {
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

const resetDatabase = async () => {
  await assertSafeTestDatabase();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
};

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("auth routes", () => {
  it("registers a user and creates a session", async () => {
    const response = await api.post("/auth/register").send(buildRegistrationPayload());

    assert.equal(response.status, 201);
    assert.equal(response.body.user.emailAddress, "person@example.com");
    assert.equal(typeof response.body.accessToken, "string");
    assert.equal(typeof response.body.refreshToken, "string");

    const user = await prisma.user.findUnique({
      where: {
        emailAddress: "person@example.com",
      },
    });

    assert.ok(user);
    assert.notEqual(user.passwordHash, defaultPassword);

    const session = await prisma.session.findFirst({
      where: {
        userId: user.id,
      },
    });

    assert.ok(session);
    assert.notEqual(session.refreshTokenHash, response.body.refreshToken);
    assert.equal(session.deviceName, "Pixel 9");
  });

  it("rejects duplicate email registration", async () => {
    await api.post("/auth/register").send(buildRegistrationPayload());

    const response = await api.post("/auth/register").send({
      emailAddress: "person@example.com",
      password: defaultPassword,
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "An account with that email already exists.");
  });

  it("logs in with valid credentials", async () => {
    const user = await prisma.user.create({
      data: {
        emailAddress: "person@example.com",
        passwordHash: await hashPassword(defaultPassword),
      },
    });

    const response = await api.post("/auth/login").send({
      emailAddress: "PERSON@example.com",
      password: defaultPassword,
      deviceName: "iPhone 16",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.id, user.id);
    assert.equal(typeof response.body.accessToken, "string");
    assert.equal(typeof response.body.refreshToken, "string");

    const session = await prisma.session.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(session);
    assert.equal(session.deviceName, "iPhone 16");
  });

  it("rejects invalid login credentials", async () => {
    await prisma.user.create({
      data: {
        emailAddress: "person@example.com",
        passwordHash: await hashPassword(defaultPassword),
      },
    });

    const response = await api.post("/auth/login").send({
      emailAddress: "person@example.com",
      password: "wrong-pass-1",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid email or password.");
  });

  it("returns the current user for a valid access token", async () => {
    const registration = await api.post("/auth/register").send(buildRegistrationPayload());

    const response = await api
      .get("/auth/me")
      .set("Authorization", `Bearer ${registration.body.accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.user.emailAddress, "person@example.com");
    assert.equal("sessionId" in response.body.user, false);
  });

  it("rejects requests without a bearer token", async () => {
    const response = await api.get("/auth/me");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects invalid access tokens", async () => {
    const response = await api.get("/auth/me").set("Authorization", "Bearer not-a-real-token");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or expired access token.");
  });

  it("rotates refresh tokens and rejects reuse of the old token", async () => {
    const registration = await api.post("/auth/register").send(buildRegistrationPayload());

    const refreshResponse = await api.post("/auth/refresh").send({
      refreshToken: registration.body.refreshToken,
      deviceName: "Updated Device",
    });

    assert.equal(refreshResponse.status, 200);
    assert.notEqual(refreshResponse.body.refreshToken, registration.body.refreshToken);
    assert.equal(typeof refreshResponse.body.accessToken, "string");

    const reusedRefreshResponse = await api.post("/auth/refresh").send({
      refreshToken: registration.body.refreshToken,
    });

    assert.equal(reusedRefreshResponse.status, 401);
    assert.equal(reusedRefreshResponse.body.error, "Invalid refresh token.");
  });

  it("rejects invalid refresh tokens", async () => {
    const response = await api.post("/auth/refresh").send({
      refreshToken: "not-a-real-refresh-token",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid refresh token.");
  });

  it("revokes the current session on logout", async () => {
    const registration = await api.post("/auth/register").send(buildRegistrationPayload());

    const logoutResponse = await api.post("/auth/logout").send({
      refreshToken: registration.body.refreshToken,
    });

    assert.equal(logoutResponse.status, 204);

    const refreshResponse = await api.post("/auth/refresh").send({
      refreshToken: registration.body.refreshToken,
    });

    assert.equal(refreshResponse.status, 401);
    assert.equal(refreshResponse.body.error, "Invalid refresh token.");

    const meResponse = await api
      .get("/auth/me")
      .set("Authorization", `Bearer ${registration.body.accessToken}`);

    assert.equal(meResponse.status, 401);
    assert.equal(meResponse.body.error, "Invalid or expired access token.");
  });
});
