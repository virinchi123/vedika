import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const calendarEventDependenciesExist = await (async () => {
  const result = await prisma.$queryRaw<Array<{
    event_booking_exists: boolean;
    followup_exists: boolean;
  }>>`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'EventBooking'
      ) AS event_booking_exists,
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'Followup'
      ) AS followup_exists
  `;

  return Boolean(
    result[0]?.event_booking_exists &&
    result[0]?.followup_exists,
  );
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

const createEventBookingRecord = async (
  references: Awaited<ReturnType<typeof createReferences>>,
  overrides: Partial<{
    bookingStart: Date;
    bookingEnd: Date;
    muhurat: Date | null;
    customerName: string;
    phoneNumber1: string;
  }> = {},
) => {
  return prisma.eventBooking.create({
    data: {
      mode: "PHONE_IN",
      bookingStatusId: references.bookingStatus.id,
      eventStatusId: references.eventStatus.id,
      eventTypeId: references.eventType.id,
      bookingStart: new Date("2026-04-20T10:00:00.000Z"),
      bookingEnd: new Date("2026-04-20T12:00:00.000Z"),
      muhurat: null,
      customerName: `Customer ${crypto.randomUUID()}`,
      phoneNumber1: "9876543210",
      ...overrides,
    },
  });
};

const createFollowupRecord = async ({
  references,
  dueDate,
  eventBookingId,
}: {
  references: Awaited<ReturnType<typeof createReferences>>;
  dueDate: Date;
  eventBookingId?: string;
}) => {
  const supportingEventBooking = eventBookingId === undefined
    ? await createEventBookingRecord(references)
    : null;

  return prisma.followup.create({
    data: {
      dueDate,
      type: "BOOKING",
      description: "Calendar reminder",
      eventBookingId: eventBookingId ?? supportingEventBooking!.id,
      serviceProviderId: null,
      customerInteractionId: null,
    },
  });
};

setupIntegrationTestLifecycle();

describe("calendar event routes", { skip: !calendarEventDependenciesExist }, () => {
  it("rejects unauthenticated requests", async () => {
    const response = await api
      .get("/calendar-events")
      .query({
        fromDate: "2026-04-10",
        toDate: "2026-04-12",
      });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("requires fromDate", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        toDate: "2026-04-12",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "fromDate must be a string.");
  });

  it("requires toDate", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-10",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "toDate must be a string.");
  });

  it("rejects invalid fromDate and toDate values", async () => {
    const accessToken = await registerAndAuthenticate();

    const invalidFromDateResponse = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-02-30",
        toDate: "2026-04-12",
      });

    assert.equal(invalidFromDateResponse.status, 400);
    assert.equal(
      invalidFromDateResponse.body.error,
      "fromDate must be a valid date in YYYY-MM-DD format.",
    );

    const invalidToDateResponse = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-10",
        toDate: "2026/04/12",
      });

    assert.equal(invalidToDateResponse.status, 400);
    assert.equal(
      invalidToDateResponse.body.error,
      "toDate must be a valid date in YYYY-MM-DD format.",
    );
  });

  it("rejects fromDate values after toDate", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-13",
        toDate: "2026-04-12",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "fromDate must be less than or equal to toDate.");
  });

  it("includes followups and event bookings inside the range", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const eventBooking = await createEventBookingRecord(references, {
      muhurat: new Date("2026-04-11T09:30:00.000Z"),
    });
    const followup = await createFollowupRecord({
      references,
      dueDate: new Date("2026-04-12T10:00:00.000Z"),
    });

    const response = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-10",
        toDate: "2026-04-12",
      });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.events, [
      {
        date: "2026-04-11T09:30:00.000Z",
        type: "event_booking",
        objectId: eventBooking.id,
      },
      {
        date: "2026-04-12T10:00:00.000Z",
        type: "followup",
        objectId: followup.id,
      },
    ]);
  });

  it("excludes event bookings with null muhurat", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    await createEventBookingRecord(references, {
      muhurat: null,
    });

    const response = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-10",
        toDate: "2026-04-12",
      });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.events, []);
  });

  it("treats both range boundaries as inclusive across the full UTC day", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const lowerBoundaryFollowup = await createFollowupRecord({
      references,
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
    });
    const upperBoundaryEventBooking = await createEventBookingRecord(references, {
      muhurat: new Date("2026-04-12T23:59:59.999Z"),
    });
    await createFollowupRecord({
      references,
      dueDate: new Date("2026-04-09T23:59:59.999Z"),
    });
    await createEventBookingRecord(references, {
      muhurat: new Date("2026-04-13T00:00:00.000Z"),
    });

    const response = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-10",
        toDate: "2026-04-12",
      });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.events.map((event: { type: string; objectId: string }) => ({
        type: event.type,
        objectId: event.objectId,
      })),
      [
        {
          type: "followup",
          objectId: lowerBoundaryFollowup.id,
        },
        {
          type: "event_booking",
          objectId: upperBoundaryEventBooking.id,
        },
      ],
    );
  });

  it("orders results by date, then type, then objectId", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const sharedDate = new Date("2026-04-11T10:00:00.000Z");
    const eventBooking = await createEventBookingRecord(references, {
      muhurat: sharedDate,
    });
    const firstFollowup = await createFollowupRecord({
      references,
      dueDate: sharedDate,
    });
    const secondFollowup = await createFollowupRecord({
      references,
      dueDate: sharedDate,
    });

    const response = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-11",
        toDate: "2026-04-11",
      });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.events.map((event: { type: string; objectId: string }) => ({
        type: event.type,
        objectId: event.objectId,
      })),
      [
        {
          type: "event_booking",
          objectId: eventBooking.id,
        },
        ...[firstFollowup.id, secondFollowup.id]
          .sort((left, right) => left.localeCompare(right))
          .map((objectId) => ({
            type: "followup",
            objectId,
          })),
      ],
    );
  });

  it("paginates mixed followup and event booking results", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const firstEvent = await createFollowupRecord({
      references,
      dueDate: new Date("2026-04-10T09:00:00.000Z"),
    });
    const secondEvent = await createEventBookingRecord(references, {
      muhurat: new Date("2026-04-11T09:00:00.000Z"),
    });
    const thirdEvent = await createFollowupRecord({
      references,
      dueDate: new Date("2026-04-12T09:00:00.000Z"),
    });
    const fourthEvent = await createEventBookingRecord(references, {
      muhurat: new Date("2026-04-13T09:00:00.000Z"),
    });

    const firstPageResponse = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-10",
        toDate: "2026-04-13",
        limit: "2",
      });

    assert.equal(firstPageResponse.status, 200);
    assert.deepEqual(
      firstPageResponse.body.events.map((event: { type: string; objectId: string }) => ({
        type: event.type,
        objectId: event.objectId,
      })),
      [
        {
          type: "followup",
          objectId: firstEvent.id,
        },
        {
          type: "event_booking",
          objectId: secondEvent.id,
        },
      ],
    );
    assert.equal(firstPageResponse.body.pageInfo.limit, 2);
    assert.equal(firstPageResponse.body.pageInfo.hasNextPage, true);
    assert.equal(typeof firstPageResponse.body.pageInfo.nextCursor, "string");

    const secondPageResponse = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-10",
        toDate: "2026-04-13",
        limit: "2",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      });

    assert.equal(secondPageResponse.status, 200);
    assert.deepEqual(
      secondPageResponse.body.events.map((event: { type: string; objectId: string }) => ({
        type: event.type,
        objectId: event.objectId,
      })),
      [
        {
          type: "followup",
          objectId: thirdEvent.id,
        },
        {
          type: "event_booking",
          objectId: fourthEvent.id,
        },
      ],
    );
    assert.equal(secondPageResponse.body.pageInfo.hasNextPage, false);
    assert.equal(secondPageResponse.body.pageInfo.nextCursor, null);
  });

  it("paginates correctly across same-timestamp event_booking and followup ties", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const sharedDate = new Date("2026-04-11T10:00:00.000Z");
    const eventBooking = await createEventBookingRecord(references, {
      muhurat: sharedDate,
    });
    const followup = await createFollowupRecord({
      references,
      dueDate: sharedDate,
    });

    const firstPageResponse = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-11",
        toDate: "2026-04-11",
        limit: "1",
      });

    assert.equal(firstPageResponse.status, 200);
    assert.deepEqual(firstPageResponse.body.events, [
      {
        date: "2026-04-11T10:00:00.000Z",
        type: "event_booking",
        objectId: eventBooking.id,
      },
    ]);

    const secondPageResponse = await api
      .get("/calendar-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-11",
        toDate: "2026-04-11",
        limit: "1",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      });

    assert.equal(secondPageResponse.status, 200);
    assert.deepEqual(secondPageResponse.body.events, [
      {
        date: "2026-04-11T10:00:00.000Z",
        type: "followup",
        objectId: followup.id,
      },
    ]);
    assert.equal(secondPageResponse.body.pageInfo.hasNextPage, false);
  });
});
