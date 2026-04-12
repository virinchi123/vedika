import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FollowupType } from "../src/generated/prisma/enums.js";
import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const followupTableExists = await (async () => {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'Followup'
    ) AS "exists"
  `;

  return result[0]?.exists ?? false;
})();

const createReferences = async () => {
  const bookingStatus = await prisma.bookingStatus.create({
    data: {
      name: `Booking Status ${crypto.randomUUID()}`,
    },
  });
  const eventStatus = await prisma.eventStatus.create({
    data: {
      name: `Event Status ${crypto.randomUUID()}`,
    },
  });
  const eventType = await prisma.eventType.create({
    data: {
      name: `Event Type ${crypto.randomUUID()}`,
    },
  });
  const serviceProvider = await prisma.serviceProvider.create({
    data: {
      name: `Service Provider ${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@example.com`,
    },
  });
  const eventBooking = await prisma.eventBooking.create({
    data: {
      mode: "PHONE_IN",
      bookingStatusId: bookingStatus.id,
      eventStatusId: eventStatus.id,
      eventTypeId: eventType.id,
      bookingStart: new Date("2026-04-20T10:00:00.000Z"),
      bookingEnd: new Date("2026-04-20T12:00:00.000Z"),
      muhurat: new Date("2026-04-20T09:30:00.000Z"),
      customerName: "Priya Sharma",
      phoneNumber1: "9876543210",
    },
  });
  const customerInteraction = await prisma.customerInteraction.create({
    data: {
      interactionType: "PHONE_IN",
      occurredAt: new Date("2026-04-21T10:00:00.000Z"),
    },
  });

  return {
    eventBooking,
    serviceProvider,
    customerInteraction,
  };
};

const createFollowupRecord = async (
  overrides: Partial<{
    dueDate: Date;
    type: FollowupType;
    description: string | null;
    eventBookingId: string | null;
    serviceProviderId: string | null;
    customerInteractionId: string | null;
  }> = {},
) => {
  const references = await createReferences();

  return prisma.followup.create({
    data: {
      dueDate: new Date("2026-04-22T10:00:00.000Z"),
      type: FollowupType.BOOKING,
      description: "Call customer with update",
      eventBookingId: references.eventBooking.id,
      serviceProviderId: null,
      customerInteractionId: null,
      ...overrides,
    },
  });
};

setupIntegrationTestLifecycle();

describe("followup routes", { skip: !followupTableExists }, () => {
  it("gets a followup by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const followup = await createFollowupRecord();

    const response = await api
      .get(`/followups/${followup.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.followup.id, followup.id);
    assert.equal(response.body.followup.type, FollowupType.BOOKING);
    assert.equal(response.body.followup.customerInteractionId, null);
  });

  it("returns not found when getting an unknown followup", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get(`/followups/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Followup not found.");
  });

  it("lists followups with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    const older = await createFollowupRecord({
      dueDate: new Date("2026-04-21T10:00:00.000Z"),
    });
    const newer = await createFollowupRecord({
      dueDate: new Date("2026-04-23T10:00:00.000Z"),
    });

    const firstResponse = await api
      .get("/followups")
      .query({
        limit: 1,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.body.followups.length, 1);
    assert.equal(firstResponse.body.followups[0].id, newer.id);
    assert.equal(firstResponse.body.pageInfo.limit, 1);
    assert.equal(firstResponse.body.pageInfo.hasNextPage, true);
    assert.equal(typeof firstResponse.body.pageInfo.nextCursor, "string");

    const secondResponse = await api
      .get("/followups")
      .query({
        limit: 1,
        cursor: firstResponse.body.pageInfo.nextCursor,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(secondResponse.status, 200);
    assert.equal(secondResponse.body.followups.length, 1);
    assert.equal(secondResponse.body.followups[0].id, older.id);
    assert.equal(secondResponse.body.pageInfo.hasNextPage, false);
    assert.equal(secondResponse.body.pageInfo.nextCursor, null);
  });

  it("filters followups by type", async () => {
    const accessToken = await registerAndAuthenticate();
    const bookingFollowup = await createFollowupRecord();
    const { serviceProvider } = await createReferences();
    await prisma.followup.create({
      data: {
        dueDate: new Date("2026-04-23T10:00:00.000Z"),
        type: FollowupType.SERVICE,
        description: "Confirm provider availability",
        eventBookingId: null,
        serviceProviderId: serviceProvider.id,
        customerInteractionId: null,
      },
    });

    const response = await api
      .get("/followups")
      .query({
        type: FollowupType.BOOKING,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.followups.length, 1);
    assert.equal(response.body.followups[0].id, bookingFollowup.id);
  });

  it("filters followups by due date", async () => {
    const accessToken = await registerAndAuthenticate();
    const targetDueDate = "2026-04-23T10:00:00.000Z";
    const targetFollowup = await createFollowupRecord({
      dueDate: new Date(targetDueDate),
    });
    await createFollowupRecord({
      dueDate: new Date("2026-04-24T10:00:00.000Z"),
    });

    const response = await api
      .get("/followups")
      .query({
        dueDate: targetDueDate,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.followups.length, 1);
    assert.equal(response.body.followups[0].id, targetFollowup.id);
  });

  it("filters followups by event booking id", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const targetFollowup = await prisma.followup.create({
      data: {
        dueDate: new Date("2026-04-23T10:00:00.000Z"),
        type: FollowupType.BOOKING,
        eventBookingId: references.eventBooking.id,
        serviceProviderId: null,
        customerInteractionId: null,
      },
    });
    await createFollowupRecord();

    const response = await api
      .get("/followups")
      .query({
        eventBookingId: references.eventBooking.id,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.followups.length, 1);
    assert.equal(response.body.followups[0].id, targetFollowup.id);
  });

  it("filters followups by service provider id", async () => {
    const accessToken = await registerAndAuthenticate();
    const { serviceProvider } = await createReferences();
    const targetFollowup = await prisma.followup.create({
      data: {
        dueDate: new Date("2026-04-23T10:00:00.000Z"),
        type: FollowupType.SERVICE,
        eventBookingId: null,
        serviceProviderId: serviceProvider.id,
        customerInteractionId: null,
      },
    });
    await createFollowupRecord();

    const response = await api
      .get("/followups")
      .query({
        serviceProviderId: serviceProvider.id,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.followups.length, 1);
    assert.equal(response.body.followups[0].id, targetFollowup.id);
  });

  it("creates a booking followup", async () => {
    const accessToken = await registerAndAuthenticate();
    const { eventBooking } = await createReferences();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.BOOKING,
        description: "  Call customer with update  ",
        eventBookingId: eventBooking.id,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.followup.type, FollowupType.BOOKING);
    assert.equal(response.body.followup.description, "Call customer with update");
    assert.equal(response.body.followup.eventBookingId, eventBooking.id);
    assert.equal(response.body.followup.serviceProviderId, null);
    assert.equal(response.body.followup.customerInteractionId, null);
  });

  it("creates a service followup", async () => {
    const accessToken = await registerAndAuthenticate();
    const { serviceProvider } = await createReferences();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.SERVICE,
        serviceProviderId: serviceProvider.id,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.followup.type, FollowupType.SERVICE);
    assert.equal(response.body.followup.eventBookingId, null);
    assert.equal(response.body.followup.serviceProviderId, serviceProvider.id);
    assert.equal(response.body.followup.customerInteractionId, null);
  });

  it("creates a followup linked to a customer interaction", async () => {
    const accessToken = await registerAndAuthenticate();
    const { eventBooking, customerInteraction } = await createReferences();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.BOOKING,
        eventBookingId: eventBooking.id,
        customerInteractionId: customerInteraction.id,
      });

    assert.equal(response.status, 201);
    assert.equal(
      response.body.followup.customerInteractionId,
      customerInteraction.id,
    );
  });

  it("rejects a booking followup without an event booking id", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.BOOKING,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "eventBookingId is required when type is BOOKING.");
  });

  it("rejects a service followup without a service provider id", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.SERVICE,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "serviceProviderId is required when type is SERVICE.");
  });

  it("rejects a booking followup with a service provider id", async () => {
    const accessToken = await registerAndAuthenticate();
    const { eventBooking, serviceProvider } = await createReferences();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.BOOKING,
        eventBookingId: eventBooking.id,
        serviceProviderId: serviceProvider.id,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "serviceProviderId is not allowed when type is BOOKING.");
  });

  it("rejects a service followup with an event booking id", async () => {
    const accessToken = await registerAndAuthenticate();
    const { eventBooking, serviceProvider } = await createReferences();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.SERVICE,
        eventBookingId: eventBooking.id,
        serviceProviderId: serviceProvider.id,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "eventBookingId is not allowed when type is SERVICE.");
  });

  it("returns not found when creating with an unknown event booking id", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.BOOKING,
        eventBookingId: crypto.randomUUID(),
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event booking not found.");
  });

  it("returns not found when creating with an unknown service provider id", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.SERVICE,
        serviceProviderId: crypto.randomUUID(),
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Service provider not found.");
  });

  it("returns not found when creating with an unknown customer interaction id", async () => {
    const accessToken = await registerAndAuthenticate();
    const { eventBooking } = await createReferences();

    const response = await api
      .post("/followups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        dueDate: "2026-04-24T10:00:00.000Z",
        type: FollowupType.BOOKING,
        eventBookingId: eventBooking.id,
        customerInteractionId: crypto.randomUUID(),
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Customer interaction not found.");
  });

  it("deletes a followup by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const followup = await createFollowupRecord();

    const response = await api
      .delete(`/followups/${followup.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const deletedFollowup = await prisma.followup.findUnique({
      where: {
        id: followup.id,
      },
    });

    assert.equal(deletedFollowup, null);
  });

  it("returns not found when deleting an unknown followup", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .delete(`/followups/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Followup not found.");
  });
});
