import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "../src/generated/prisma/client.js";
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

const createServiceProviderRecord = async (name: string) => {
  return prisma.serviceProvider.create({
    data: {
      name,
      email: `${crypto.randomUUID()}@example.com`,
        commissionRate: 13
    },
  });
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
  serviceProviderIds: string[];
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
    serviceProviderIds: [],
    ...overrides,
  };
};

const createEventBookingRecord = async (
  references: Awaited<ReturnType<typeof createReferences>>,
  overrides: Partial<{
    createdAt: Date;
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
    serviceProviders: {
      connect: Array<{
        id: string;
      }>;
    };
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
      serviceProviders: {
        connect: [],
      },
      ...overrides,
    },
  });
};

const listServicesForEventBooking = async (eventBookingId: string) => {
  return prisma.service.findMany({
    where: {
      eventBookingId,
    },
    select: {
      id: true,
      serviceProviderId: true,
      contractedAmount: true,
      commissionAmount: true,
    },
    orderBy: {
      serviceProviderId: "asc",
    },
  });
};

setupIntegrationTestLifecycle();

describe("event booking routes", { skip: !eventBookingTableExists }, () => {
  it("lists event bookings with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const oldestBooking = await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      customerName: "Oldest Booking",
      phoneNumber1: "9000000001",
    });
    const middleBooking = await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-02T00:00:00.000Z"),
      customerName: "Middle Booking",
      phoneNumber1: "9000000002",
    });
    const newestBooking = await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      customerName: "Newest Booking",
      phoneNumber1: "9000000003",
    });

    const firstPageResponse = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ limit: "2" });

    assert.equal(firstPageResponse.status, 200);
    assert.deepEqual(
      firstPageResponse.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [newestBooking.id, middleBooking.id],
    );
    assert.deepEqual(firstPageResponse.body.pageInfo, {
      limit: 2,
      hasNextPage: true,
      nextCursor: firstPageResponse.body.pageInfo.nextCursor,
    });
    assert.ok(firstPageResponse.body.pageInfo.nextCursor);

    const secondPageResponse = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        limit: "2",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      });

    assert.equal(secondPageResponse.status, 200);
    assert.deepEqual(
      secondPageResponse.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [oldestBooking.id],
    );
    assert.deepEqual(secondPageResponse.body.pageInfo, {
      limit: 2,
      hasNextPage: false,
      nextCursor: null,
    });
  });

  it("rejects unauthenticated list requests", async () => {
    const response = await api.get("/event-bookings");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("gets an event booking with discoverable service ids", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const providerOne = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);
    const providerTwo = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);
    const eventBooking = await createEventBookingRecord(references, {
      serviceProviders: {
        connect: [{ id: providerOne.id }, { id: providerTwo.id }],
      },
    });
    const firstService = await prisma.service.create({
      data: {
        serviceProviderId: providerOne.id,
        eventBookingId: eventBooking.id,
        contractedAmount: new Prisma.Decimal("12000.00"),
        commissionAmount: new Prisma.Decimal("1200.00"),
      },
    });
    const secondService = await prisma.service.create({
      data: {
        serviceProviderId: providerTwo.id,
        eventBookingId: eventBooking.id,
        contractedAmount: null,
        commissionAmount: null,
      },
    });

    const response = await api
      .get(`/event-bookings/${eventBooking.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.eventBooking.id, eventBooking.id);
    assert.deepEqual(response.body.eventBooking.serviceProviderIds, [
      providerOne.id,
      providerTwo.id,
    ].sort());
    assert.deepEqual(response.body.eventBooking.services, [
      {
        id: firstService.id,
        serviceProviderId: providerOne.id,
        contractedAmount: "12000.00",
        commissionAmount: "1200.00",
      },
      {
        id: secondService.id,
        serviceProviderId: providerTwo.id,
        contractedAmount: null,
        commissionAmount: null,
      },
    ].sort((left, right) => left.serviceProviderId.localeCompare(right.serviceProviderId)));
  });

  it("returns not found when getting an unknown event booking", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get(`/event-bookings/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event booking not found.");
  });

  it("filters event bookings by case-insensitive customer name substring", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const matchingBooking = await createEventBookingRecord(references, {
      customerName: "Ananya Rao",
      phoneNumber1: "9100000001",
    });
    await createEventBookingRecord(references, {
      customerName: "Priya Sharma",
      phoneNumber1: "9100000002",
    });

    const response = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ name: "anya" });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [matchingBooking.id],
    );
  });

  it("filters event bookings by phone number across all phone fields", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const phoneNumber1Match = await createEventBookingRecord(references, {
      customerName: "Primary Phone",
      phoneNumber1: "8000000001",
      phoneNumber2: null,
      phoneNumber3: null,
    });
    const phoneNumber2Match = await createEventBookingRecord(references, {
      customerName: "Secondary Phone",
      phoneNumber1: "8000000002",
      phoneNumber2: "8111111111",
      phoneNumber3: null,
    });
    const phoneNumber3Match = await createEventBookingRecord(references, {
      customerName: "Tertiary Phone",
      phoneNumber1: "8000000003",
      phoneNumber2: null,
      phoneNumber3: "8222222222",
    });
    await createEventBookingRecord(references, {
      customerName: "Different Phone",
      phoneNumber1: "8333333333",
      phoneNumber2: null,
      phoneNumber3: null,
    });

    const phoneNumber1Response = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ phoneNumber: " 8000000001 " });

    assert.equal(phoneNumber1Response.status, 200);
    assert.deepEqual(
      phoneNumber1Response.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [phoneNumber1Match.id],
    );

    const phoneNumber2Response = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ phoneNumber: "8111111111" });

    assert.equal(phoneNumber2Response.status, 200);
    assert.deepEqual(
      phoneNumber2Response.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [phoneNumber2Match.id],
    );

    const phoneNumber3Response = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ phoneNumber: "8222222222" });

    assert.equal(phoneNumber3Response.status, 200);
    assert.deepEqual(
      phoneNumber3Response.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [phoneNumber3Match.id],
    );
  });

  it("filters event bookings by overlapping date range", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const insideRange = await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-02T00:00:00.000Z"),
      customerName: "Inside Range",
      phoneNumber1: "7000000001",
      bookingStart: new Date("2026-04-11T10:00:00.000Z"),
      bookingEnd: new Date("2026-04-11T12:00:00.000Z"),
    });
    const overlapsStartBoundary = await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      customerName: "Overlap Start",
      phoneNumber1: "7000000002",
      bookingStart: new Date("2026-04-09T23:00:00.000Z"),
      bookingEnd: new Date("2026-04-10T02:00:00.000Z"),
    });
    const overlapsEndBoundary = await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      customerName: "Overlap End",
      phoneNumber1: "7000000003",
      bookingStart: new Date("2026-04-12T22:00:00.000Z"),
      bookingEnd: new Date("2026-04-13T02:00:00.000Z"),
    });
    await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-04T00:00:00.000Z"),
      customerName: "Outside Range",
      phoneNumber1: "7000000004",
      bookingStart: new Date("2026-04-14T10:00:00.000Z"),
      bookingEnd: new Date("2026-04-14T12:00:00.000Z"),
    });

    const response = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-10",
        toDate: "2026-04-12",
      });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [overlapsEndBoundary.id, insideRange.id, overlapsStartBoundary.id],
    );
  });

  it("filters event bookings when only fromDate is supplied", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const matchingBooking = await createEventBookingRecord(references, {
      customerName: "Starts Before But Ends After From Date",
      phoneNumber1: "7100000001",
      bookingStart: new Date("2026-04-09T20:00:00.000Z"),
      bookingEnd: new Date("2026-04-10T03:00:00.000Z"),
    });
    await createEventBookingRecord(references, {
      customerName: "Ends Before From Date",
      phoneNumber1: "7100000002",
      bookingStart: new Date("2026-04-08T10:00:00.000Z"),
      bookingEnd: new Date("2026-04-09T23:59:59.000Z"),
    });

    const response = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ fromDate: "2026-04-10" });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [matchingBooking.id],
    );
  });

  it("filters event bookings when only toDate is supplied", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const matchingBooking = await createEventBookingRecord(references, {
      customerName: "Starts Before To Date Ends After",
      phoneNumber1: "7200000001",
      bookingStart: new Date("2026-04-12T23:59:59.000Z"),
      bookingEnd: new Date("2026-04-13T03:00:00.000Z"),
    });
    await createEventBookingRecord(references, {
      customerName: "Starts After To Date",
      phoneNumber1: "7200000002",
      bookingStart: new Date("2026-04-13T00:00:00.000Z"),
      bookingEnd: new Date("2026-04-13T02:00:00.000Z"),
    });

    const response = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ toDate: "2026-04-12" });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [matchingBooking.id],
    );
  });

  it("validates list date filters", async () => {
    const accessToken = await registerAndAuthenticate();

    const invalidFromDateResponse = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ fromDate: "2026-02-30" });

    assert.equal(invalidFromDateResponse.status, 400);
    assert.equal(
      invalidFromDateResponse.body.error,
      "fromDate must be a valid date in YYYY-MM-DD format.",
    );

    const invalidToDateResponse = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ toDate: "2026/04/12" });

    assert.equal(invalidToDateResponse.status, 400);
    assert.equal(
      invalidToDateResponse.body.error,
      "toDate must be a valid date in YYYY-MM-DD format.",
    );

    const reversedRangeResponse = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        fromDate: "2026-04-13",
        toDate: "2026-04-12",
      });

    assert.equal(reversedRangeResponse.status, 400);
    assert.equal(
      reversedRangeResponse.body.error,
      "fromDate must be less than or equal to toDate.",
    );
  });

  it("combines list filters with pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const firstMatch = await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      customerName: "Ananya Family Booking 1",
      phoneNumber1: "6000000000",
      bookingStart: new Date("2026-04-11T09:00:00.000Z"),
      bookingEnd: new Date("2026-04-11T10:00:00.000Z"),
    });
    const secondMatch = await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-02T00:00:00.000Z"),
      customerName: "ANANYA Family Booking 2",
      phoneNumber1: "6000000000",
      bookingStart: new Date("2026-04-12T09:00:00.000Z"),
      bookingEnd: new Date("2026-04-12T10:00:00.000Z"),
    });
    await createEventBookingRecord(references, {
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      customerName: "Ananya Wrong Phone",
      phoneNumber1: "6999999999",
      bookingStart: new Date("2026-04-12T09:00:00.000Z"),
      bookingEnd: new Date("2026-04-12T10:00:00.000Z"),
    });

    const response = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        name: "ananya",
        phoneNumber: "6000000000",
        fromDate: "2026-04-11",
        toDate: "2026-04-12",
        limit: "1",
      });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [firstMatch.id],
    );
    assert.equal(response.body.pageInfo.limit, 1);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(response.body.pageInfo.nextCursor);

    const nextPageResponse = await api
      .get("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({
        name: "ananya",
        phoneNumber: "6000000000",
        fromDate: "2026-04-11",
        toDate: "2026-04-12",
        limit: "1",
        cursor: response.body.pageInfo.nextCursor,
      });

    assert.equal(nextPageResponse.status, 200);
    assert.deepEqual(
      nextPageResponse.body.eventBookings.map((eventBooking: { id: string }) => eventBooking.id),
      [secondMatch.id],
    );
    assert.equal(nextPageResponse.body.pageInfo.hasNextPage, false);
    assert.equal(nextPageResponse.body.pageInfo.nextCursor, null);
  });

  it("creates an event booking for an authenticated request", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const providerOne = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);
    const providerTwo = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          phoneNumber2: "   ",
          referredBy: "  Cousin  ",
          serviceProviderIds: [
            providerOne.id,
            providerTwo.id,
          ],
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

    const storedEventBooking = await prisma.eventBooking.findUnique({
      where: {
        id: response.body.eventBooking.id,
      },
      select: {
        serviceProviders: {
          select: {
            id: true,
          },
          orderBy: {
            id: "asc",
          },
        },
      },
    });

    assert.deepEqual(
      storedEventBooking?.serviceProviders.map((provider) => provider.id),
      [providerOne.id, providerTwo.id].sort(),
    );

    const storedServices = await listServicesForEventBooking(response.body.eventBooking.id);

    assert.deepEqual(
      storedServices.map((service) => service.serviceProviderId),
      [providerOne.id, providerTwo.id].sort(),
    );
    assert.deepEqual(
      storedServices.map((service) => ({
        contractedAmount: service.contractedAmount,
        commissionAmount: service.commissionAmount,
      })),
      [
        {
          contractedAmount: null,
          commissionAmount: null,
        },
        {
          contractedAmount: null,
          commissionAmount: null,
        },
      ],
    );
  });

  it("creates an event booking with no providers when serviceProviderIds is omitted", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const payload = buildEventBookingPayload(references);

    delete payload.serviceProviderIds;

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    assert.equal(response.status, 201);

    const storedEventBooking = await prisma.eventBooking.findUnique({
      where: {
        id: response.body.eventBooking.id,
      },
      select: {
        serviceProviders: {
          select: {
            id: true,
          },
        },
      },
    });

    assert.deepEqual(storedEventBooking?.serviceProviders, []);

    const storedServices = await listServicesForEventBooking(response.body.eventBooking.id);

    assert.deepEqual(storedServices, []);
  });

  it("deduplicates service provider ids on create", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const provider = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          serviceProviderIds: [provider.id, provider.id, `  ${provider.id}  `],
        }),
      );

    assert.equal(response.status, 201);

    const storedEventBooking = await prisma.eventBooking.findUnique({
      where: {
        id: response.body.eventBooking.id,
      },
      select: {
        serviceProviders: {
          select: {
            id: true,
          },
        },
      },
    });

    assert.deepEqual(storedEventBooking?.serviceProviders.map((item) => item.id), [provider.id]);

    const storedServices = await listServicesForEventBooking(response.body.eventBooking.id);

    assert.deepEqual(storedServices.map((service) => service.serviceProviderId), [provider.id]);
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

  it("returns not found when a service provider does not exist on create", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();

    const response = await api
      .post("/event-bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          serviceProviderIds: ["missing-service-provider"],
        }),
      );

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Service provider not found.");
  });

  it("updates an event booking with a full replacement payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const originalReferences = await createReferences();
    const replacementReferences = await createReferences();
    const originalProvider = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);
    const replacementProviderOne = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);
    const replacementProviderTwo = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);
    const existingEventBooking = await createEventBookingRecord(originalReferences);
    await prisma.eventBooking.update({
      where: {
        id: existingEventBooking.id,
      },
      data: {
        serviceProviders: {
          connect: [{ id: originalProvider.id }],
        },
      },
    });
    await prisma.service.create({
      data: {
        serviceProviderId: originalProvider.id,
        eventBookingId: existingEventBooking.id,
        contractedAmount: new Prisma.Decimal("5000.00"),
        commissionAmount: new Prisma.Decimal("500.00"),
      },
    });

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
          serviceProviderIds: [replacementProviderOne.id, replacementProviderTwo.id],
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

    const storedEventBooking = await prisma.eventBooking.findUnique({
      where: {
        id: existingEventBooking.id,
      },
      select: {
        serviceProviders: {
          select: {
            id: true,
          },
          orderBy: {
            id: "asc",
          },
        },
      },
    });

    assert.deepEqual(
      storedEventBooking?.serviceProviders.map((provider) => provider.id),
      [replacementProviderOne.id, replacementProviderTwo.id].sort(),
    );
    assert.equal(
      storedEventBooking?.serviceProviders.some((provider) => provider.id === originalProvider.id),
      false,
    );

    const storedServices = await listServicesForEventBooking(existingEventBooking.id);

    assert.deepEqual(
      storedServices.map((service) => service.serviceProviderId),
      [replacementProviderOne.id, replacementProviderTwo.id].sort(),
    );
    assert.deepEqual(
      storedServices.map((service) => ({
        contractedAmount: service.contractedAmount,
        commissionAmount: service.commissionAmount,
      })),
      [
        {
          contractedAmount: null,
          commissionAmount: null,
        },
        {
          contractedAmount: null,
          commissionAmount: null,
        },
      ],
    );
  });

  it("preserves existing service amounts for retained providers on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const provider = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);
    const existingEventBooking = await createEventBookingRecord(references, {
      serviceProviders: {
        connect: [{ id: provider.id }],
      },
    });
    const existingService = await prisma.service.create({
      data: {
        serviceProviderId: provider.id,
        eventBookingId: existingEventBooking.id,
        contractedAmount: new Prisma.Decimal("12000.00"),
        commissionAmount: new Prisma.Decimal("1200.00"),
      },
    });

    const response = await api
      .put(`/event-bookings/${existingEventBooking.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildEventBookingPayload(references, {
          customerName: "Updated Customer",
          serviceProviderIds: [provider.id],
        }),
      );

    assert.equal(response.status, 200);

    const storedServices = await listServicesForEventBooking(existingEventBooking.id);

    assert.equal(storedServices.length, 1);
    assert.equal(storedServices[0]?.id, existingService.id);
    assert.equal(storedServices[0]?.serviceProviderId, provider.id);
    assert.equal(storedServices[0]?.contractedAmount?.toString(), "12000");
    assert.equal(storedServices[0]?.commissionAmount?.toString(), "1200");
  });

  it("requires serviceProviderIds on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const provider = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);
    const existingEventBooking = await createEventBookingRecord(references, {
      serviceProviders: {
        connect: [{ id: provider.id }],
      },
    });
    await prisma.service.create({
      data: {
        serviceProviderId: provider.id,
        eventBookingId: existingEventBooking.id,
      },
    });
    const payload = buildEventBookingPayload(references);

    delete payload.serviceProviderIds;

    const response = await api
      .put(`/event-bookings/${existingEventBooking.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "serviceProviderIds is required.");

    const storedEventBooking = await prisma.eventBooking.findUnique({
      where: {
        id: existingEventBooking.id,
      },
      select: {
        serviceProviders: {
          select: {
            id: true,
          },
        },
      },
    });

    assert.deepEqual(storedEventBooking?.serviceProviders.map((item) => item.id), [provider.id]);

    const storedServices = await listServicesForEventBooking(existingEventBooking.id);

    assert.equal(storedServices.length, 1);
    assert.equal(storedServices[0]?.serviceProviderId, provider.id);
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
    const provider = await createServiceProviderRecord(`Provider ${crypto.randomUUID()}`);
    const existingEventBooking = await createEventBookingRecord(references, {
      serviceProviders: {
        connect: [{ id: provider.id }],
      },
    });
    const service = await prisma.service.create({
      data: {
        serviceProviderId: provider.id,
        eventBookingId: existingEventBooking.id,
      },
    });

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

    const linkedService = await prisma.service.findUnique({
      where: {
        id: service.id,
      },
    });

    assert.equal(linkedService, null);
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
