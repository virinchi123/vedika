import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EventBookingMode } from "../src/generated/prisma/enums.js";
import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const eventBookingTableExists = await (async () => {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'EventBooking'
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

  return {
    bookingStatus,
    eventStatus,
    eventType,
  };
};

type EventBookingPayloadOverrides = Partial<{
  mode: EventBookingMode;
  bookingStatusId: string;
  eventStatusId: string;
  eventTypeId: string;
  bookingStart: string;
  bookingEnd: string;
  muhurat: string | null;
  customerName: string;
  phoneNumber1: string;
  phoneNumber2: string | null;
  phoneNumber3: string | null;
  referredBy: string | null;
}>;

const buildEventBookingPayload = (
  references: Awaited<ReturnType<typeof createReferences>>,
  overrides: EventBookingPayloadOverrides = {},
) => {
  return {
    mode: EventBookingMode.PHONE_IN,
    bookingStatusId: references.bookingStatus.id,
    eventStatusId: references.eventStatus.id,
    eventTypeId: references.eventType.id,
    bookingStart: "2026-04-20T10:00:00.000Z",
    bookingEnd: "2026-04-20T12:00:00.000Z",
    muhurat: "2026-04-20T09:30:00.000Z",
    customerName: "  Priya Sharma  ",
    phoneNumber1: "  9876543210  ",
    phoneNumber2: "  9123456780  ",
    phoneNumber3: "  9988776655  ",
    referredBy: "  Family Friend  ",
    ...overrides,
  };
};

const createEventBookingRecord = async (
  references: Awaited<ReturnType<typeof createReferences>>,
  overrides: Partial<{
    mode: EventBookingMode;
    bookingStart: Date;
    bookingEnd: Date;
    muhurat: Date | null;
    customerName: string;
    phoneNumber1: string;
    phoneNumber2: string | null;
    phoneNumber3: string | null;
    referredBy: string | null;
    bookingStatusId: string;
    eventStatusId: string;
    eventTypeId: string;
  }> = {},
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
      phoneNumber2: "9123456780",
      phoneNumber3: "9988776655",
      referredBy: "Family Friend",
      ...overrides,
    },
  });
};

setupIntegrationTestLifecycle();

describe("event booking routes", { skip: !eventBookingTableExists }, () => {
  it("creates an event booking for an authenticated request", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          phoneNumber2: "   ",
          referredBy: "  Cousin  ",
        }),
      );

    assert.equal(response.status, 201);
    assert.equal(response.body.eventBooking.mode, EventBookingMode.PHONE_IN);
    assert.equal(response.body.eventBooking.customerName, "Priya Sharma");
    assert.equal(response.body.eventBooking.phoneNumber1, "9876543210");
    assert.equal(response.body.eventBooking.phoneNumber2, null);
    assert.equal(response.body.eventBooking.referredBy, "Cousin");
    assert.equal(
      response.body.eventBooking.bookingStart,
      "2026-04-20T10:00:00.000Z",
    );

    const eventBooking = await prisma.eventBooking.findUnique({
      where: {
        id: response.body.eventBooking.id,
      },
    });

    assert.ok(eventBooking);
    assert.equal(eventBooking.customerName, "Priya Sharma");
    assert.equal(eventBooking.phoneNumber2, null);
    assert.equal(eventBooking.referredBy, "Cousin");
  });

  it("rejects unauthenticated create requests", async () => {
    const references = await createReferences();

    const response = await api
      .post("/event-bookings")
      .send(buildEventBookingPayload(references));

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects invalid booking mode values", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          mode: "ONLINE" as EventBookingMode,
        }),
      );

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "mode must be one of PHONE_IN, WALK_IN.");
  });

  it("rejects invalid datetime values", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          bookingStart: "not-a-datetime",
        }),
      );

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "bookingStart must be a valid ISO-8601 datetime string.",
    );
  });

  it("rejects missing required fields on create", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const payload = buildEventBookingPayload(references);

    delete payload.customerName;

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "customerName must be a string.");
  });

  it("returns not found when booking status does not exist on create", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          bookingStatusId: "missing-booking-status",
        }),
      );

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Booking status not found.");
  });

  it("returns not found when event status does not exist on create", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          eventStatusId: "missing-event-status",
        }),
      );

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event status not found.");
  });

  it("returns not found when event type does not exist on create", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          eventTypeId: "missing-event-type",
        }),
      );

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event type not found.");
  });

  it("updates an event booking with a full replacement payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const originalReferences = await createReferences();
    const replacementReferences = await createReferences();
    const existingEventBooking = await createEventBookingRecord(originalReferences);

    const response = await api
      .put(`/event-bookings/${existingEventBooking.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(replacementReferences, {
          mode: EventBookingMode.WALK_IN,
          muhurat: null,
          customerName: "  Ananya Rao  ",
          phoneNumber2: null,
          phoneNumber3: "   ",
          referredBy: null,
        }),
      );

    assert.equal(response.status, 200);
    assert.equal(response.body.eventBooking.mode, EventBookingMode.WALK_IN);
    assert.equal(response.body.eventBooking.customerName, "Ananya Rao");
    assert.equal(response.body.eventBooking.muhurat, null);
    assert.equal(response.body.eventBooking.phoneNumber2, null);
    assert.equal(response.body.eventBooking.phoneNumber3, null);
    assert.equal(response.body.eventBooking.referredBy, null);
    assert.equal(
      response.body.eventBooking.eventTypeId,
      replacementReferences.eventType.id,
    );

    const updatedEventBooking = await prisma.eventBooking.findUnique({
      where: {
        id: existingEventBooking.id,
      },
    });

    assert.ok(updatedEventBooking);
    assert.equal(updatedEventBooking.mode, EventBookingMode.WALK_IN);
    assert.equal(updatedEventBooking.customerName, "Ananya Rao");
    assert.equal(updatedEventBooking.muhurat, null);
    assert.equal(updatedEventBooking.phoneNumber2, null);
    assert.equal(updatedEventBooking.phoneNumber3, null);
    assert.equal(updatedEventBooking.referredBy, null);
    assert.equal(updatedEventBooking.eventTypeId, replacementReferences.eventType.id);
  });

  it("rejects unauthenticated update requests", async () => {
    const references = await createReferences();
    const existingEventBooking = await createEventBookingRecord(references);

    const response = await api
      .put(`/event-bookings/${existingEventBooking.id}`)
      .send(buildEventBookingPayload(references));

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("requires all required fields on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const existingEventBooking = await createEventBookingRecord(references);
    const payload = buildEventBookingPayload(references);

    delete payload.bookingEnd;

    const response = await api
      .put(`/event-bookings/${existingEventBooking.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "bookingEnd must be a string.");
  });

  it("returns not found when updating an unknown event booking", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();

    const response = await api
      .put("/event-bookings/missing-event-booking")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildEventBookingPayload(references));

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event booking not found.");
  });

  it("returns not found when update references a missing related record", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const existingEventBooking = await createEventBookingRecord(references);

    const response = await api
      .put(`/event-bookings/${existingEventBooking.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          eventTypeId: "missing-event-type",
        }),
      );

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event type not found.");
  });

  it("deletes an event booking by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const existingEventBooking = await createEventBookingRecord(references);

    const response = await api
      .delete(`/event-bookings/${existingEventBooking.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const eventBooking = await prisma.eventBooking.findUnique({
      where: {
        id: existingEventBooking.id,
      },
    });

    assert.equal(eventBooking, null);
  });

  it("rejects unauthenticated delete requests", async () => {
    const references = await createReferences();
    const existingEventBooking = await createEventBookingRecord(references);

    const response = await api.delete(`/event-bookings/${existingEventBooking.id}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("returns not found when deleting an unknown event booking", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .delete("/event-bookings/missing-event-booking")
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event booking not found.");
  });
});
