import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import request from "supertest";

import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const api = request(app);
const defaultPassword = "password123";
let hasValidatedTestDatabase = false;

const buildRegistrationPayload = () => ({
  emailAddress: "person@example.com",
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
  await prisma.serviceProvider.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
};

const registerAndAuthenticate = async (): Promise<string> => {
  const registration = await api.post("/auth/register").send(buildRegistrationPayload());

  assert.equal(registration.status, 201);

  return registration.body.accessToken as string;
};

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("service provider routes", () => {
  it("creates a service provider for an authenticated request", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/service-providers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Acme Services",
        phoneNumber: " +91 98765 43210 ",
        email: " CONTACT@ACME.COM ",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.serviceProvider.name, "Acme Services");
    assert.equal(response.body.serviceProvider.phoneNumber, "+91 98765 43210");
    assert.equal(response.body.serviceProvider.email, "contact@acme.com");

    const serviceProvider = await prisma.serviceProvider.findUnique({
      where: {
        id: response.body.serviceProvider.id,
      },
    });

    assert.ok(serviceProvider);
    assert.equal(serviceProvider.name, "Acme Services");
  });

  it("rejects unauthenticated create requests", async () => {
    const response = await api.post("/service-providers").send({
      name: "Acme Services",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("updates a service provider with a full replacement payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingServiceProvider = await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
        phoneNumber: "1111111111",
        email: "old@example.com",
      },
    });

    const response = await api
      .put(`/service-providers/${existingServiceProvider.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Updated Services",
        phoneNumber: "",
        email: "new@example.com",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.serviceProvider.name, "Updated Services");
    assert.equal(response.body.serviceProvider.phoneNumber, null);
    assert.equal(response.body.serviceProvider.email, "new@example.com");

    const updatedServiceProvider = await prisma.serviceProvider.findUnique({
      where: {
        id: existingServiceProvider.id,
      },
    });

    assert.ok(updatedServiceProvider);
    assert.equal(updatedServiceProvider.name, "Updated Services");
    assert.equal(updatedServiceProvider.phoneNumber, null);
    assert.equal(updatedServiceProvider.email, "new@example.com");
  });

  it("rejects duplicate names", async () => {
    const accessToken = await registerAndAuthenticate();
    await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
      },
    });

    const response = await api
      .post("/service-providers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Acme Services",
        email: "different@example.com",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "A service provider with that name already exists.");
  });

  it("rejects duplicate emails", async () => {
    const accessToken = await registerAndAuthenticate();
    await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
        email: "contact@example.com",
      },
    });

    const response = await api
      .post("/service-providers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Updated Services",
        email: "contact@example.com",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "A service provider with that email already exists.");
  });

  it("requires name on full replacement updates", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingServiceProvider = await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
      },
    });

    const response = await api
      .put(`/service-providers/${existingServiceProvider.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: "new@example.com",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "name must be a string.");
  });

  it("deletes a service provider by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingServiceProvider = await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
      },
    });

    const response = await api
      .delete(`/service-providers/${existingServiceProvider.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const serviceProvider = await prisma.serviceProvider.findUnique({
      where: {
        id: existingServiceProvider.id,
      },
    });

    assert.equal(serviceProvider, null);
  });
});
