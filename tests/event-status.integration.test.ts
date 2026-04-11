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
  await prisma.eventStatus.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.eventType.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
};

const registerAndAuthenticate = async (): Promise<string> => {
  const registration = await api.post("/auth/register").send(buildRegistrationPayload());

  assert.equal(registration.status, 201);

  return registration.body.accessToken as string;
};

const createEventStatusRecord = async (name: string, createdAt: string) => {
  return prisma.eventStatus.create({
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

describe("event status routes", () => {
  it("lists event statuses with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    await createEventStatusRecord("Oldest Status", "2026-04-10T10:00:00.000Z");
    await createEventStatusRecord("Middle Status", "2026-04-11T10:00:00.000Z");
    const newestEventStatus = await createEventStatusRecord("Newest Status", "2026-04-12T10:00:00.000Z");

    const response = await api
      .get("/event-statuses")
      .query({
        limit: "2",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.eventStatuses.map((eventStatus: { name: string }) => eventStatus.name),
      ["Newest Status", "Middle Status"],
    );
    assert.equal(response.body.pageInfo.limit, 2);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
    assert.equal(response.body.eventStatuses[0].id, newestEventStatus.id);
  });

  it("lists the next page when a cursor is provided", async () => {
    const accessToken = await registerAndAuthenticate();
    await createEventStatusRecord("Oldest Status", "2026-04-10T10:00:00.000Z");
    await createEventStatusRecord("Middle Status", "2026-04-11T10:00:00.000Z");
    await createEventStatusRecord("Newest Status", "2026-04-12T10:00:00.000Z");

    const firstPageResponse = await api
      .get("/event-statuses")
      .query({
        limit: "1",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(firstPageResponse.status, 200);
    assert.ok(typeof firstPageResponse.body.pageInfo.nextCursor === "string");

    const response = await api
      .get("/event-statuses")
      .query({
        limit: "1",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.eventStatuses.map((eventStatus: { name: string }) => eventStatus.name),
      ["Middle Status"],
    );
    assert.equal(response.body.pageInfo.limit, 1);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("rejects unauthenticated list requests", async () => {
    const response = await api.get("/event-statuses");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects invalid pagination params", async () => {
    const accessToken = await registerAndAuthenticate();

    const invalidLimitResponse = await api
      .get("/event-statuses")
      .query({
        limit: "0",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidLimitResponse.status, 400);
    assert.equal(invalidLimitResponse.body.error, "limit must be a positive integer.");

    const invalidCursorResponse = await api
      .get("/event-statuses")
      .query({
        cursor: "not-a-valid-cursor",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidCursorResponse.status, 400);
    assert.equal(invalidCursorResponse.body.error, "cursor must be a valid cursor.");
  });

  it("creates an event status for an authenticated request", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/event-statuses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "  Confirmed  ",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.eventStatus.name, "Confirmed");

    const eventStatus = await prisma.eventStatus.findUnique({
      where: {
        id: response.body.eventStatus.id,
      },
    });

    assert.ok(eventStatus);
    assert.equal(eventStatus.name, "Confirmed");
  });

  it("rejects unauthenticated create requests", async () => {
    const response = await api.post("/event-statuses").send({
      name: "Confirmed",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("updates an event status with a full replacement payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingEventStatus = await prisma.eventStatus.create({
      data: {
        name: "Pending",
      },
    });

    const response = await api
      .put(`/event-statuses/${existingEventStatus.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "  Completed  ",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.eventStatus.name, "Completed");

    const updatedEventStatus = await prisma.eventStatus.findUnique({
      where: {
        id: existingEventStatus.id,
      },
    });

    assert.ok(updatedEventStatus);
    assert.equal(updatedEventStatus.name, "Completed");
  });

  it("rejects unauthenticated update requests", async () => {
    const existingEventStatus = await prisma.eventStatus.create({
      data: {
        name: "Pending",
      },
    });

    const response = await api.put(`/event-statuses/${existingEventStatus.id}`).send({
      name: "Completed",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects duplicate names on create", async () => {
    const accessToken = await registerAndAuthenticate();
    await prisma.eventStatus.create({
      data: {
        name: "Confirmed",
      },
    });

    const response = await api
      .post("/event-statuses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Confirmed",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "An event status with that name already exists.");
  });

  it("rejects duplicate names on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const originalEventStatus = await prisma.eventStatus.create({
      data: {
        name: "Pending",
      },
    });
    await prisma.eventStatus.create({
      data: {
        name: "Completed",
      },
    });

    const response = await api
      .put(`/event-statuses/${originalEventStatus.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Completed",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "An event status with that name already exists.");
  });

  it("requires name on full replacement updates", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingEventStatus = await prisma.eventStatus.create({
      data: {
        name: "Pending",
      },
    });

    const response = await api
      .put(`/event-statuses/${existingEventStatus.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "name must be a string.");
  });

  it("returns not found when updating an unknown event status", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .put("/event-statuses/missing-event-status")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Confirmed",
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event status not found.");
  });

  it("deletes an event status by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingEventStatus = await prisma.eventStatus.create({
      data: {
        name: "Pending",
      },
    });

    const response = await api
      .delete(`/event-statuses/${existingEventStatus.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const eventStatus = await prisma.eventStatus.findUnique({
      where: {
        id: existingEventStatus.id,
      },
    });

    assert.equal(eventStatus, null);
  });

  it("rejects unauthenticated delete requests", async () => {
    const existingEventStatus = await prisma.eventStatus.create({
      data: {
        name: "Pending",
      },
    });

    const response = await api.delete(`/event-statuses/${existingEventStatus.id}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("returns not found when deleting an unknown event status", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .delete("/event-statuses/missing-event-status")
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event status not found.");
  });
});
