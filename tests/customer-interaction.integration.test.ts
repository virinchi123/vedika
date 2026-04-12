import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CustomerInteractionType,
  EventBookingMode,
} from "../src/generated/prisma/enums.js";
import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const customerInteractionTableExists = await (async () => {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'CustomerInteraction'
    ) AS "exists"
  `;

  return result[0]?.exists ?? false;
})();

const createEventBookingReferences = async () => {
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

  return {
    bookingStatus,
    eventStatus,
    eventType,
  };
};

const createEventBookingRecord = async (
  references: Awaited<ReturnType<typeof createEventBookingReferences>>,
) => {
  return prisma.eventBooking.create({
    data: {
      mode: EventBookingMode.PHONE_IN,
      bookingStatusId: references.bookingStatus.id,
      eventStatusId: references.eventStatus.id,
      eventTypeId: references.eventType.id,
      bookingStart: new Date("2026-04-20T10:00:00.000Z"),
      bookingEnd: new Date("2026-04-20T12:00:00.000Z"),
      muhurat: new Date("2026-04-20T09:30:00.000Z"),
      customerName: "Priya Sharma",
      phoneNumber1: "9876543210",
      phoneNumber2: null,
      phoneNumber3: null,
      referredBy: null,
      serviceProviders: {
        connect: [],
      },
    },
  });
};

type CustomerInteractionPayloadOverrides = Partial<{
  interactionType: CustomerInteractionType | string;
  occurredAt: string;
  eventBookingIds: string[];
}>;

const buildCustomerInteractionPayload = (
  overrides: CustomerInteractionPayloadOverrides = {},
) => {
  return {
    interactionType: CustomerInteractionType.PHONE_IN,
    occurredAt: "2026-04-19T11:15:00.000Z",
    eventBookingIds: undefined,
    ...overrides,
  };
};

setupIntegrationTestLifecycle();

describe("customer interaction routes", { skip: !customerInteractionTableExists }, () => {
  it("creates a customer interaction without event bookings", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildCustomerInteractionPayload());

    assert.equal(response.status, 201);
    assert.equal(
      response.body.customerInteraction.interactionType,
      CustomerInteractionType.PHONE_IN,
    );
    assert.equal(
      response.body.customerInteraction.occurredAt,
      "2026-04-19T11:15:00.000Z",
    );
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, []);

    const storedCustomerInteraction = await prisma.customerInteraction.findUnique({
      where: {
        id: response.body.customerInteraction.id,
      },
      select: {
        eventBookings: {
          select: {
            id: true,
          },
          orderBy: {
            id: "asc",
          },
        },
      },
    });

    assert.ok(storedCustomerInteraction);
    assert.deepEqual(storedCustomerInteraction.eventBookings, []);
  });

  it("creates a customer interaction with valid event booking ids", async () => {
    const accessToken = await registerAndAuthenticate();
    const firstReferences = await createEventBookingReferences();
    const secondReferences = await createEventBookingReferences();
    const firstEventBooking = await createEventBookingRecord(firstReferences);
    const secondEventBooking = await createEventBookingRecord(secondReferences);

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          eventBookingIds: [secondEventBooking.id, firstEventBooking.id],
        }),
      );

    assert.equal(response.status, 201);
    assert.equal(
      response.body.customerInteraction.interactionType,
      CustomerInteractionType.WALK_IN,
    );
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, [
      firstEventBooking.id,
      secondEventBooking.id,
    ].sort());
  });

  it("creates a customer interaction with no event bookings when eventBookingIds is omitted", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildCustomerInteractionPayload());

    assert.equal(response.status, 201);
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, []);
  });

  it("deduplicates event booking ids on create", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createEventBookingReferences();
    const eventBooking = await createEventBookingRecord(references);

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          eventBookingIds: [eventBooking.id, eventBooking.id, `  ${eventBooking.id}  `],
        }),
      );

    assert.equal(response.status, 201);
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, [eventBooking.id]);
  });

  it("rejects an invalid interaction type", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: "ONLINE",
        }),
      );

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "interactionType must be one of WALK_IN, PHONE_IN, MISSED_CALL.",
    );
  });

  it("rejects an invalid occurredAt", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          occurredAt: "not-a-datetime",
        }),
      );

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "occurredAt must be a valid ISO-8601 datetime string.",
    );
  });

  it("returns not found when creating with an unknown event booking id", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          eventBookingIds: [crypto.randomUUID()],
        }),
      );

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event booking not found.");
  });

  it("rejects a non-array eventBookingIds value", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...buildCustomerInteractionPayload(),
        eventBookingIds: "not-an-array",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "eventBookingIds must be an array.");
  });

  it("requires authentication for create, update, and delete", async () => {
    const unauthenticatedCreate = await api
      .post("/customer-interactions")
      .send(buildCustomerInteractionPayload());
    assert.equal(unauthenticatedCreate.status, 401);

    const unauthenticatedUpdate = await api
      .put(`/customer-interactions/${crypto.randomUUID()}`)
      .send(buildCustomerInteractionPayload());
    assert.equal(unauthenticatedUpdate.status, 401);

    const unauthenticatedDelete = await api.delete(
      `/customer-interactions/${crypto.randomUUID()}`,
    );
    assert.equal(unauthenticatedDelete.status, 401);
  });

  it("updates a customer interaction and changes the event booking links", async () => {
    const accessToken = await registerAndAuthenticate();
    const firstReferences = await createEventBookingReferences();
    const secondReferences = await createEventBookingReferences();
    const originalEventBooking = await createEventBookingRecord(firstReferences);
    const replacementEventBooking = await createEventBookingRecord(secondReferences);
    const existingCustomerInteraction = await prisma.customerInteraction.create({
      data: {
        interactionType: CustomerInteractionType.PHONE_IN,
        occurredAt: new Date("2026-04-19T11:15:00.000Z"),
        eventBookings: {
          connect: [{ id: originalEventBooking.id }],
        },
      },
    });

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.MISSED_CALL,
          occurredAt: "2026-04-21T09:00:00.000Z",
          eventBookingIds: [replacementEventBooking.id],
        }),
      );

    assert.equal(response.status, 200);
    assert.equal(
      response.body.customerInteraction.interactionType,
      CustomerInteractionType.MISSED_CALL,
    );
    assert.equal(
      response.body.customerInteraction.occurredAt,
      "2026-04-21T09:00:00.000Z",
    );
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, [
      replacementEventBooking.id,
    ]);
  });

  it("clears event booking ids on update when an empty array is provided", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createEventBookingReferences();
    const eventBooking = await createEventBookingRecord(references);
    const existingCustomerInteraction = await prisma.customerInteraction.create({
      data: {
        interactionType: CustomerInteractionType.WALK_IN,
        occurredAt: new Date("2026-04-19T11:15:00.000Z"),
        eventBookings: {
          connect: [{ id: eventBooking.id }],
        },
      },
    });

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          occurredAt: "2026-04-20T08:45:00.000Z",
          eventBookingIds: [],
        }),
      );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, []);
  });

  it("returns not found when updating an unknown customer interaction", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .put(`/customer-interactions/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildCustomerInteractionPayload());

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Customer interaction not found.");
  });

  it("returns not found when updating with an unknown event booking id", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await prisma.customerInteraction.create({
      data: {
        interactionType: CustomerInteractionType.PHONE_IN,
        occurredAt: new Date("2026-04-19T11:15:00.000Z"),
      },
    });

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          eventBookingIds: [crypto.randomUUID()],
        }),
      );

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event booking not found.");
  });

  it("deletes a customer interaction by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await prisma.customerInteraction.create({
      data: {
        interactionType: CustomerInteractionType.MISSED_CALL,
        occurredAt: new Date("2026-04-19T11:15:00.000Z"),
      },
    });

    const response = await api
      .delete(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const storedCustomerInteraction = await prisma.customerInteraction.findUnique({
      where: {
        id: existingCustomerInteraction.id,
      },
    });

    assert.equal(storedCustomerInteraction, null);
  });

  it("returns not found when deleting an unknown customer interaction", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .delete(`/customer-interactions/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Customer interaction not found.");
  });
});
