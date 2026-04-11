import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import request from "supertest";

import { resetAuthRateLimit } from "../src/auth/auth.router.js";
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
  await prisma.eventType.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
};

const registerAndAuthenticate = async (): Promise<string> => {
  const registration = await api.post("/auth/register").send(buildRegistrationPayload());

  assert.equal(registration.status, 201);

  return registration.body.accessToken as string;
};

const createEventTypeRecord = async (name: string, createdAt: string) => {
  return prisma.eventType.create({
    data: {
      name,
      createdAt: new Date(createdAt),
    },
  });
};

beforeEach(async () => {
  resetAuthRateLimit();
  await resetDatabase();
});

after(async () => {
  resetAuthRateLimit();
  await resetDatabase();
  await prisma.$disconnect();
});

describe("event type routes", () => {
  it("lists event types with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    await createEventTypeRecord("Oldest Event", "2026-04-10T10:00:00.000Z");
    await createEventTypeRecord("Middle Event", "2026-04-11T10:00:00.000Z");
    const newestEventType = await createEventTypeRecord("Newest Event", "2026-04-12T10:00:00.000Z");

    const response = await api
      .get("/event-types")
      .query({
        limit: "2",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.eventTypes.map((eventType: { name: string }) => eventType.name),
      ["Newest Event", "Middle Event"],
    );
    assert.equal(response.body.pageInfo.limit, 2);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
    assert.equal(response.body.eventTypes[0].id, newestEventType.id);
  });

  it("lists the next page when a cursor is provided", async () => {
    const accessToken = await registerAndAuthenticate();
    await createEventTypeRecord("Oldest Event", "2026-04-10T10:00:00.000Z");
    await createEventTypeRecord("Middle Event", "2026-04-11T10:00:00.000Z");
    await createEventTypeRecord("Newest Event", "2026-04-12T10:00:00.000Z");

    const firstPageResponse = await api
      .get("/event-types")
      .query({
        limit: "1",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(firstPageResponse.status, 200);
    assert.ok(typeof firstPageResponse.body.pageInfo.nextCursor === "string");

    const response = await api
      .get("/event-types")
      .query({
        limit: "1",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.eventTypes.map((eventType: { name: string }) => eventType.name),
      ["Middle Event"],
    );
    assert.equal(response.body.pageInfo.limit, 1);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("rejects unauthenticated list requests", async () => {
    const response = await api.get("/event-types");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects invalid pagination params", async () => {
    const accessToken = await registerAndAuthenticate();

    const invalidLimitResponse = await api
      .get("/event-types")
      .query({
        limit: "0",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidLimitResponse.status, 400);
    assert.equal(invalidLimitResponse.body.error, "limit must be a positive integer.");

    const invalidCursorResponse = await api
      .get("/event-types")
      .query({
        cursor: "not-a-valid-cursor",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidCursorResponse.status, 400);
    assert.equal(invalidCursorResponse.body.error, "cursor must be a valid cursor.");
  });

  it("creates an event type for an authenticated request", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/event-types")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "  Conference  ",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.eventType.name, "Conference");

    const eventType = await prisma.eventType.findUnique({
      where: {
        id: response.body.eventType.id,
      },
    });

    assert.ok(eventType);
    assert.equal(eventType.name, "Conference");

    const defaultBookingConfiguration = await prisma.defaultBookingConfiguration.findUnique({
      where: {
        eventTypeId: response.body.eventType.id,
      },
    });

    assert.ok(defaultBookingConfiguration);
    assert.equal(defaultBookingConfiguration.eventTypeId, response.body.eventType.id);
    assert.equal(defaultBookingConfiguration.defaultDurationInMinutes, 240);
    assert.equal(defaultBookingConfiguration.defaultStartTime.getUTCHours(), 8);
    assert.equal(defaultBookingConfiguration.defaultStartTime.getUTCMinutes(), 0);
    assert.equal(defaultBookingConfiguration.defaultStartTime.getUTCSeconds(), 0);
  });

  it("rejects unauthenticated create requests", async () => {
    const response = await api.post("/event-types").send({
      name: "Conference",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("updates an event type with a full replacement payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingEventType = await prisma.eventType.create({
      data: {
        name: "Conference",
      },
    });

    const response = await api
      .put(`/event-types/${existingEventType.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "  Workshop  ",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.eventType.name, "Workshop");

    const updatedEventType = await prisma.eventType.findUnique({
      where: {
        id: existingEventType.id,
      },
    });

    assert.ok(updatedEventType);
    assert.equal(updatedEventType.name, "Workshop");
  });

  it("rejects unauthenticated update requests", async () => {
    const existingEventType = await prisma.eventType.create({
      data: {
        name: "Conference",
      },
    });

    const response = await api.put(`/event-types/${existingEventType.id}`).send({
      name: "Workshop",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects duplicate names on create", async () => {
    const accessToken = await registerAndAuthenticate();
    await prisma.eventType.create({
      data: {
        name: "Conference",
      },
    });

    const response = await api
      .post("/event-types")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Conference",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "An event type with that name already exists.");
  });

  it("rejects duplicate names on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const originalEventType = await prisma.eventType.create({
      data: {
        name: "Conference",
      },
    });
    await prisma.eventType.create({
      data: {
        name: "Workshop",
      },
    });

    const response = await api
      .put(`/event-types/${originalEventType.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Workshop",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "An event type with that name already exists.");
  });

  it("requires name on full replacement updates", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingEventType = await prisma.eventType.create({
      data: {
        name: "Conference",
      },
    });

    const response = await api
      .put(`/event-types/${existingEventType.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "name must be a string.");
  });

  it("returns not found when updating an unknown event type", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .put("/event-types/missing-event-type")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Conference",
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event type not found.");
  });

  it("deletes an event type by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingEventType = await prisma.eventType.create({
      data: {
        name: "Conference",
        defaultBookingConfiguration: {
          create: {},
        },
      },
    });

    const response = await api
      .delete(`/event-types/${existingEventType.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const eventType = await prisma.eventType.findUnique({
      where: {
        id: existingEventType.id,
      },
    });

    assert.equal(eventType, null);

    const defaultBookingConfiguration = await prisma.defaultBookingConfiguration.findUnique({
      where: {
        eventTypeId: existingEventType.id,
      },
    });

    assert.equal(defaultBookingConfiguration, null);
  });

  it("rejects unauthenticated delete requests", async () => {
    const existingEventType = await prisma.eventType.create({
      data: {
        name: "Conference",
      },
    });

    const response = await api.delete(`/event-types/${existingEventType.id}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("returns not found when deleting an unknown event type", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .delete("/event-types/missing-event-type")
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event type not found.");
  });
});
