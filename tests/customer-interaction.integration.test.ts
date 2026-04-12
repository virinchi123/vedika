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

const buildIgnoreCustomerInteractionPayload = (
  ignored: boolean | unknown = true,
) => ({
  ignored,
});

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

const createCustomerInteractionRecord = async ({
  interactionType = CustomerInteractionType.PHONE_IN,
  occurredAt = "2026-04-19T11:15:00.000Z",
  createdAt = "2026-04-19T11:15:00.000Z",
  ignored = false,
  eventBookingIds = [],
}: Partial<{
  interactionType: CustomerInteractionType;
  occurredAt: string;
  createdAt: string;
  ignored: boolean;
  eventBookingIds: string[];
}> = {}) => {
  return prisma.customerInteraction.create({
    data: {
      interactionType,
      occurredAt: new Date(occurredAt),
      createdAt: new Date(createdAt),
      ignored,
      eventBookings: {
        connect: eventBookingIds.map((id) => ({ id })),
      },
    },
  });
};

setupIntegrationTestLifecycle();

describe("customer interaction routes", { skip: !customerInteractionTableExists }, () => {
  it("gets a customer interaction by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const firstReferences = await createEventBookingReferences();
    const secondReferences = await createEventBookingReferences();
    const firstEventBooking = await createEventBookingRecord(firstReferences);
    const secondEventBooking = await createEventBookingRecord(secondReferences);
    const customerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.MISSED_CALL,
      occurredAt: "2026-04-22T08:00:00.000Z",
      eventBookingIds: [secondEventBooking.id, firstEventBooking.id],
    });

    const response = await api
      .get(`/customer-interactions/${customerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.customerInteraction.id, customerInteraction.id);
    assert.equal(
      response.body.customerInteraction.interactionType,
      CustomerInteractionType.MISSED_CALL,
    );
    assert.equal(
      response.body.customerInteraction.occurredAt,
      "2026-04-22T08:00:00.000Z",
    );
    assert.equal(response.body.customerInteraction.ignored, false);
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, [
      firstEventBooking.id,
      secondEventBooking.id,
    ].sort());
  });

  it("returns not found when getting an unknown customer interaction", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get(`/customer-interactions/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Customer interaction not found.");
  });

  it("lists customer interactions with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    const oldestCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.PHONE_IN,
      createdAt: "2026-04-11T10:00:00.000Z",
    });
    const newestCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.MISSED_CALL,
      createdAt: "2026-04-12T10:00:00.000Z",
    });

    const response = await api
      .get("/customer-interactions")
      .query({
        limit: "2",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.customerInteractions.map(
        (customerInteraction: { interactionType: CustomerInteractionType }) =>
          customerInteraction.interactionType,
      ),
      [CustomerInteractionType.MISSED_CALL, CustomerInteractionType.PHONE_IN],
    );
    assert.equal(response.body.customerInteractions[0].id, newestCustomerInteraction.id);
    assert.notEqual(response.body.customerInteractions[0].id, oldestCustomerInteraction.id);
    assert.equal(response.body.pageInfo.limit, 2);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
    assert.equal(response.body.customerInteractions[0].ignored, false);
    assert.deepEqual(response.body.customerInteractions[0].eventBookingIds, []);
  });

  it("lists the next page when a cursor is provided", async () => {
    const accessToken = await registerAndAuthenticate();
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.PHONE_IN,
      createdAt: "2026-04-11T10:00:00.000Z",
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.MISSED_CALL,
      createdAt: "2026-04-12T10:00:00.000Z",
    });

    const firstPageResponse = await api
      .get("/customer-interactions")
      .query({
        limit: "1",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(firstPageResponse.status, 200);
    assert.ok(typeof firstPageResponse.body.pageInfo.nextCursor === "string");

    const response = await api
      .get("/customer-interactions")
      .query({
        limit: "1",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.customerInteractions.map(
        (customerInteraction: { interactionType: CustomerInteractionType }) =>
          customerInteraction.interactionType,
      ),
      [CustomerInteractionType.PHONE_IN],
    );
    assert.equal(response.body.pageInfo.limit, 1);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("lists customer interactions filtered by event booking id", async () => {
    const accessToken = await registerAndAuthenticate();
    const targetReferences = await createEventBookingReferences();
    const otherReferences = await createEventBookingReferences();
    const thirdReferences = await createEventBookingReferences();
    const targetEventBooking = await createEventBookingRecord(targetReferences);
    const otherEventBooking = await createEventBookingRecord(otherReferences);
    const thirdEventBooking = await createEventBookingRecord(thirdReferences);
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
      createdAt: "2026-04-10T10:00:00.000Z",
      eventBookingIds: [otherEventBooking.id],
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.PHONE_IN,
      createdAt: "2026-04-11T10:00:00.000Z",
      eventBookingIds: [targetEventBooking.id],
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.MISSED_CALL,
      createdAt: "2026-04-12T10:00:00.000Z",
      eventBookingIds: [thirdEventBooking.id, targetEventBooking.id],
    });

    const response = await api
      .get("/customer-interactions")
      .query({
        eventBookingId: targetEventBooking.id,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.customerInteractions.map(
        (customerInteraction: { interactionType: CustomerInteractionType }) =>
          customerInteraction.interactionType,
      ),
      [CustomerInteractionType.MISSED_CALL, CustomerInteractionType.PHONE_IN],
    );
    assert.deepEqual(response.body.customerInteractions[0].eventBookingIds, [
      targetEventBooking.id,
      thirdEventBooking.id,
    ].sort());
    assert.deepEqual(response.body.customerInteractions[1].eventBookingIds, [
      targetEventBooking.id,
    ]);
  });

  it("lists only unlinked customer interactions when unlinkedOnly is true", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createEventBookingReferences();
    const eventBooking = await createEventBookingRecord(references);
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.PHONE_IN,
      createdAt: "2026-04-11T10:00:00.000Z",
      eventBookingIds: [eventBooking.id],
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.MISSED_CALL,
      createdAt: "2026-04-12T10:00:00.000Z",
    });

    const response = await api
      .get("/customer-interactions")
      .query({
        unlinkedOnly: "true",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.customerInteractions.map(
        (customerInteraction: { interactionType: CustomerInteractionType }) =>
          customerInteraction.interactionType,
      ),
      [CustomerInteractionType.MISSED_CALL, CustomerInteractionType.WALK_IN],
    );
    assert.deepEqual(response.body.customerInteractions[0].eventBookingIds, []);
    assert.deepEqual(response.body.customerInteractions[1].eventBookingIds, []);
  });

  it("lists customer interactions filtered by ignored=true", async () => {
    const accessToken = await registerAndAuthenticate();
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
      createdAt: "2026-04-10T10:00:00.000Z",
      ignored: false,
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.PHONE_IN,
      createdAt: "2026-04-11T10:00:00.000Z",
      ignored: true,
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.MISSED_CALL,
      createdAt: "2026-04-12T10:00:00.000Z",
      ignored: true,
    });

    const response = await api
      .get("/customer-interactions")
      .query({
        ignored: "true",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.customerInteractions.map(
        (customerInteraction: {
          interactionType: CustomerInteractionType;
          ignored: boolean;
        }) => ({
          interactionType: customerInteraction.interactionType,
          ignored: customerInteraction.ignored,
        }),
      ),
      [
        {
          interactionType: CustomerInteractionType.MISSED_CALL,
          ignored: true,
        },
        {
          interactionType: CustomerInteractionType.PHONE_IN,
          ignored: true,
        },
      ],
    );
  });

  it("lists customer interactions filtered by ignored=false", async () => {
    const accessToken = await registerAndAuthenticate();
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
      createdAt: "2026-04-10T10:00:00.000Z",
      ignored: true,
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.PHONE_IN,
      createdAt: "2026-04-11T10:00:00.000Z",
      ignored: false,
    });
    await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.MISSED_CALL,
      createdAt: "2026-04-12T10:00:00.000Z",
      ignored: false,
    });

    const response = await api
      .get("/customer-interactions")
      .query({
        ignored: "false",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.customerInteractions.map(
        (customerInteraction: {
          interactionType: CustomerInteractionType;
          ignored: boolean;
        }) => ({
          interactionType: customerInteraction.interactionType,
          ignored: customerInteraction.ignored,
        }),
      ),
      [
        {
          interactionType: CustomerInteractionType.MISSED_CALL,
          ignored: false,
        },
        {
          interactionType: CustomerInteractionType.PHONE_IN,
          ignored: false,
        },
      ],
    );
  });

  it("rejects using eventBookingId and unlinkedOnly together", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get("/customer-interactions")
      .query({
        eventBookingId: crypto.randomUUID(),
        unlinkedOnly: "true",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "eventBookingId and unlinkedOnly cannot be used together.",
    );
  });

  it("rejects an invalid unlinkedOnly value", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get("/customer-interactions")
      .query({
        unlinkedOnly: "maybe",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "unlinkedOnly must be a boolean.");
  });

  it("rejects an invalid ignored value", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get("/customer-interactions")
      .query({
        ignored: "maybe",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "ignored must be a boolean.");
  });

  it("returns not found when listing with an unknown event booking id", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get("/customer-interactions")
      .query({
        eventBookingId: crypto.randomUUID(),
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event booking not found.");
  });

  it("rejects unauthenticated get by id and list requests", async () => {
    const unauthenticatedGetResponse = await api.get(
      `/customer-interactions/${crypto.randomUUID()}`,
    );
    assert.equal(unauthenticatedGetResponse.status, 401);

    const unauthenticatedListResponse = await api.get("/customer-interactions");
    assert.equal(unauthenticatedListResponse.status, 401);
  });

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
    assert.equal(response.body.customerInteraction.ignored, false);
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
    assert.equal(response.body.customerInteraction.ignored, false);
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

  it("requires authentication for the ignore route", async () => {
    const response = await api
      .patch(`/customer-interactions/${crypto.randomUUID()}/ignore`)
      .send(buildIgnoreCustomerInteractionPayload(true));

    assert.equal(response.status, 401);
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
    assert.equal(response.body.customerInteraction.ignored, false);
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
    assert.equal(response.body.customerInteraction.ignored, false);
  });

  it("updates a customer interaction ignored state to true", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/ignore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildIgnoreCustomerInteractionPayload(true));

    assert.equal(response.status, 200);
    assert.equal(response.body.customerInteraction.id, existingCustomerInteraction.id);
    assert.equal(response.body.customerInteraction.ignored, true);

    const storedCustomerInteraction = await prisma.customerInteraction.findUnique({
      where: {
        id: existingCustomerInteraction.id,
      },
      select: {
        ignored: true,
      },
    });

    assert.deepEqual(storedCustomerInteraction, { ignored: true });
  });

  it("updates a customer interaction ignored state back to false", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      ignored: true,
    });

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/ignore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildIgnoreCustomerInteractionPayload(false));

    assert.equal(response.status, 200);
    assert.equal(response.body.customerInteraction.ignored, false);

    const storedCustomerInteraction = await prisma.customerInteraction.findUnique({
      where: {
        id: existingCustomerInteraction.id,
      },
      select: {
        ignored: true,
      },
    });

    assert.deepEqual(storedCustomerInteraction, { ignored: false });
  });

  it("returns not found when ignoring an unknown customer interaction", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .patch(`/customer-interactions/${crypto.randomUUID()}/ignore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildIgnoreCustomerInteractionPayload(true));

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Customer interaction not found.");
  });

  it("rejects ignore requests without an ignored boolean", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/ignore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "ignored must be a boolean.");
  });

  it("rejects ignore requests with a non-boolean ignored value", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/ignore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildIgnoreCustomerInteractionPayload("true"));

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "ignored must be a boolean.");
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
