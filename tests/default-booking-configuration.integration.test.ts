import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const createDefaultBookingConfigurationRecord = async (
  eventTypeId: string,
  createdAt: string,
  defaultStartTime = "1970-01-01T08:00:00.000Z",
  defaultDurationInMinutes = 240,
) => {
  return prisma.defaultBookingConfiguration.create({
    data: {
      eventTypeId,
      createdAt: new Date(createdAt),
      defaultStartTime: new Date(defaultStartTime),
      defaultDurationInMinutes,
    },
  });
};

setupIntegrationTestLifecycle();

describe("default booking configuration routes", () => {
  it("lists default booking configurations with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    const oldestEventType = await prisma.eventType.create({
      data: {
        name: "Oldest Event Type",
      },
    });
    const middleEventType = await prisma.eventType.create({
      data: {
        name: "Middle Event Type",
      },
    });
    const newestEventType = await prisma.eventType.create({
      data: {
        name: "Newest Event Type",
      },
    });

    await createDefaultBookingConfigurationRecord(
      oldestEventType.id,
      "2026-04-10T10:00:00.000Z",
      "1970-01-01T08:00:00.000Z",
      180,
    );
    await createDefaultBookingConfigurationRecord(
      middleEventType.id,
      "2026-04-11T10:00:00.000Z",
      "1970-01-01T09:00:00.000Z",
      210,
    );
    const newestConfiguration = await createDefaultBookingConfigurationRecord(
      newestEventType.id,
      "2026-04-12T10:00:00.000Z",
      "1970-01-01T10:30:00.000Z",
      240,
    );

    const response = await api
      .get("/default-booking-configurations")
      .query({
        limit: "2",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.defaultBookingConfigurations.length, 2);
    assert.equal(
      response.body.defaultBookingConfigurations[0].id,
      newestConfiguration.id,
    );
    assert.deepEqual(
      response.body.defaultBookingConfigurations.map(
        (configuration: { eventTypeId: string }) => configuration.eventTypeId,
      ),
      [newestEventType.id, middleEventType.id],
    );
    assert.equal(
      response.body.defaultBookingConfigurations[0].defaultStartTime,
      "10:30:00",
    );
    assert.equal(response.body.pageInfo.limit, 2);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("lists the next page when a cursor is provided", async () => {
    const accessToken = await registerAndAuthenticate();
    const oldestEventType = await prisma.eventType.create({
      data: {
        name: "Oldest Event Type",
      },
    });
    const middleEventType = await prisma.eventType.create({
      data: {
        name: "Middle Event Type",
      },
    });
    const newestEventType = await prisma.eventType.create({
      data: {
        name: "Newest Event Type",
      },
    });

    await createDefaultBookingConfigurationRecord(
      oldestEventType.id,
      "2026-04-10T10:00:00.000Z",
    );
    await createDefaultBookingConfigurationRecord(
      middleEventType.id,
      "2026-04-11T10:00:00.000Z",
    );
    await createDefaultBookingConfigurationRecord(
      newestEventType.id,
      "2026-04-12T10:00:00.000Z",
    );

    const firstPageResponse = await api
      .get("/default-booking-configurations")
      .query({
        limit: "1",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(firstPageResponse.status, 200);
    assert.ok(typeof firstPageResponse.body.pageInfo.nextCursor === "string");

    const response = await api
      .get("/default-booking-configurations")
      .query({
        limit: "1",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.defaultBookingConfigurations.map(
        (configuration: { eventTypeId: string }) => configuration.eventTypeId,
      ),
      [middleEventType.id],
    );
    assert.equal(response.body.pageInfo.limit, 1);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("rejects unauthenticated list requests", async () => {
    const response = await api.get("/default-booking-configurations");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects invalid pagination params", async () => {
    const accessToken = await registerAndAuthenticate();

    const invalidLimitResponse = await api
      .get("/default-booking-configurations")
      .query({
        limit: "0",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidLimitResponse.status, 400);
    assert.equal(
      invalidLimitResponse.body.error,
      "limit must be a positive integer.",
    );

    const invalidCursorResponse = await api
      .get("/default-booking-configurations")
      .query({
        cursor: "not-a-valid-cursor",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidCursorResponse.status, 400);
    assert.equal(
      invalidCursorResponse.body.error,
      "cursor must be a valid cursor.",
    );
  });

  it("updates a default booking configuration with a full replacement payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const originalEventType = await prisma.eventType.create({
      data: {
        name: "Consultation",
      },
    });
    const replacementEventType = await prisma.eventType.create({
      data: {
        name: "Workshop",
      },
    });
    const existingConfiguration = await prisma.defaultBookingConfiguration.create({
      data: {
        eventTypeId: originalEventType.id,
        defaultStartTime: new Date("1970-01-01T08:00:00.000Z"),
        defaultDurationInMinutes: 240,
      },
    });

    const response = await api
      .put(`/default-booking-configurations/${existingConfiguration.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        eventTypeId: replacementEventType.id,
        defaultStartTime: "09:30",
        defaultDurationInMinutes: 150,
      });

    assert.equal(response.status, 200);
    assert.equal(
      response.body.defaultBookingConfiguration.eventTypeId,
      replacementEventType.id,
    );
    assert.equal(
      response.body.defaultBookingConfiguration.defaultStartTime,
      "09:30:00",
    );
    assert.equal(
      response.body.defaultBookingConfiguration.defaultDurationInMinutes,
      150,
    );

    const updatedConfiguration = await prisma.defaultBookingConfiguration.findUnique({
      where: {
        id: existingConfiguration.id,
      },
    });

    assert.ok(updatedConfiguration);
    assert.equal(updatedConfiguration.eventTypeId, replacementEventType.id);
    assert.equal(updatedConfiguration.defaultDurationInMinutes, 150);
    assert.equal(
      updatedConfiguration.defaultStartTime.toISOString(),
      "1970-01-01T09:30:00.000Z",
    );
  });

  it("rejects unauthenticated update requests", async () => {
    const eventType = await prisma.eventType.create({
      data: {
        name: "Consultation",
      },
    });
    const existingConfiguration = await prisma.defaultBookingConfiguration.create({
      data: {
        eventTypeId: eventType.id,
        defaultStartTime: new Date("1970-01-01T08:00:00.000Z"),
        defaultDurationInMinutes: 240,
      },
    });

    const response = await api
      .put(`/default-booking-configurations/${existingConfiguration.id}`)
      .send({
        eventTypeId: eventType.id,
        defaultStartTime: "08:30",
        defaultDurationInMinutes: 180,
      });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects duplicate event type assignments on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const originalEventType = await prisma.eventType.create({
      data: {
        name: "Consultation",
      },
    });
    const conflictingEventType = await prisma.eventType.create({
      data: {
        name: "Workshop",
      },
    });
    const existingConfiguration = await prisma.defaultBookingConfiguration.create({
      data: {
        eventTypeId: originalEventType.id,
        defaultStartTime: new Date("1970-01-01T08:00:00.000Z"),
        defaultDurationInMinutes: 240,
      },
    });
    await prisma.defaultBookingConfiguration.create({
      data: {
        eventTypeId: conflictingEventType.id,
        defaultStartTime: new Date("1970-01-01T10:00:00.000Z"),
        defaultDurationInMinutes: 120,
      },
    });

    const response = await api
      .put(`/default-booking-configurations/${existingConfiguration.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        eventTypeId: conflictingEventType.id,
        defaultStartTime: "09:00",
        defaultDurationInMinutes: 180,
      });

    assert.equal(response.status, 409);
    assert.equal(
      response.body.error,
      "A default booking configuration already exists for that event type.",
    );
  });

  it("requires all fields on full replacement updates", async () => {
    const accessToken = await registerAndAuthenticate();
    const eventType = await prisma.eventType.create({
      data: {
        name: "Consultation",
      },
    });
    const existingConfiguration = await prisma.defaultBookingConfiguration.create({
      data: {
        eventTypeId: eventType.id,
        defaultStartTime: new Date("1970-01-01T08:00:00.000Z"),
        defaultDurationInMinutes: 240,
      },
    });

    const response = await api
      .put(`/default-booking-configurations/${existingConfiguration.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "eventTypeId must be a string.");
  });

  it("rejects invalid time-of-day values on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const eventType = await prisma.eventType.create({
      data: {
        name: "Consultation",
      },
    });
    const existingConfiguration = await prisma.defaultBookingConfiguration.create({
      data: {
        eventTypeId: eventType.id,
        defaultStartTime: new Date("1970-01-01T08:00:00.000Z"),
        defaultDurationInMinutes: 240,
      },
    });

    const response = await api
      .put(`/default-booking-configurations/${existingConfiguration.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        eventTypeId: eventType.id,
        defaultStartTime: "25:99",
        defaultDurationInMinutes: 120,
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "defaultStartTime must be a valid time of day in HH:mm or HH:mm:ss format.",
    );
  });

  it("rejects invalid durations on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const eventType = await prisma.eventType.create({
      data: {
        name: "Consultation",
      },
    });
    const existingConfiguration = await prisma.defaultBookingConfiguration.create({
      data: {
        eventTypeId: eventType.id,
        defaultStartTime: new Date("1970-01-01T08:00:00.000Z"),
        defaultDurationInMinutes: 240,
      },
    });

    const response = await api
      .put(`/default-booking-configurations/${existingConfiguration.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        eventTypeId: eventType.id,
        defaultStartTime: "08:00",
        defaultDurationInMinutes: 0,
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "defaultDurationInMinutes must be a positive integer.",
    );
  });

  it("returns not found when updating an unknown configuration", async () => {
    const accessToken = await registerAndAuthenticate();
    const eventType = await prisma.eventType.create({
      data: {
        name: "Consultation",
      },
    });

    const response = await api
      .put("/default-booking-configurations/missing-configuration")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        eventTypeId: eventType.id,
        defaultStartTime: "08:00",
        defaultDurationInMinutes: 240,
      });

    assert.equal(response.status, 404);
    assert.equal(
      response.body.error,
      "Default booking configuration not found.",
    );
  });

  it("returns not found when updating to an unknown event type", async () => {
    const accessToken = await registerAndAuthenticate();
    const eventType = await prisma.eventType.create({
      data: {
        name: "Consultation",
      },
    });
    const existingConfiguration = await prisma.defaultBookingConfiguration.create({
      data: {
        eventTypeId: eventType.id,
        defaultStartTime: new Date("1970-01-01T08:00:00.000Z"),
        defaultDurationInMinutes: 240,
      },
    });

    const response = await api
      .put(`/default-booking-configurations/${existingConfiguration.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        eventTypeId: "missing-event-type",
        defaultStartTime: "08:00",
        defaultDurationInMinutes: 240,
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event type not found.");
  });
});
