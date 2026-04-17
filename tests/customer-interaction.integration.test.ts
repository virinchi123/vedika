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

type VoiceNotePayload = {
  gcsPath: string;
  extension: string;
  originalName: string | null;
};

type CustomerInteractionPayloadOverrides = Partial<{
  interactionType: CustomerInteractionType | string;
  occurredAt: string;
  eventBookingIds: string[];
  voiceNote: VoiceNotePayload | null;
  clearVoiceNote: boolean;
}>;

const buildVoiceNotePayload = (
  overrides: Partial<{
    gcsPath: string;
    extension: string;
    originalName: string | null;
  }> = {},
) => {
  return {
    gcsPath: `voice-notes/${crypto.randomUUID()}.m4a`,
    extension: "m4a",
    originalName: "walk-in-note.m4a",
    ...overrides,
  };
};

const buildIgnoreCustomerInteractionPayload = (
  ignored: boolean | unknown = true,
) => ({
  ignored,
});

const buildAssociateEventBookingsPayload = (
  eventBookingIds: string[] | unknown = [],
) => ({
  eventBookingIds,
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

const createFileRecord = async ({
  gcsPath = `voice-notes/${crypto.randomUUID()}.m4a`,
  extension = "m4a",
  originalName = "walk-in-note.m4a",
}: Partial<{
  gcsPath: string;
  extension: string;
  originalName: string | null;
}> = {}) => {
  return prisma.file.create({
    data: {
      gcsPath,
      extension,
      originalName,
    },
  });
};

const createVoiceNoteRecord = async (
  customerInteractionId: string,
  fileOverrides: Partial<{
    gcsPath: string;
    extension: string;
    originalName: string | null;
  }> = {},
) => {
  const file = await createFileRecord(fileOverrides);
  const voiceNote = await prisma.voiceNote.create({
    data: {
      customerInteractionId,
      fileId: file.id,
    },
  });

  return {
    file,
    voiceNote,
  };
};

const createCustomerInteractionRecord = async ({
  interactionType = CustomerInteractionType.PHONE_IN,
  occurredAt = "2026-04-19T11:15:00.000Z",
  createdAt = "2026-04-19T11:15:00.000Z",
  ignored = false,
  eventBookingIds = [],
  voiceNote,
}: Partial<{
  interactionType: CustomerInteractionType;
  occurredAt: string;
  createdAt: string;
  ignored: boolean;
  eventBookingIds: string[];
  voiceNote: Partial<{
    gcsPath: string;
    extension: string;
    originalName: string | null;
  }>;
}> = {}) => {
  const customerInteraction = await prisma.customerInteraction.create({
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

  if (voiceNote !== undefined) {
    await createVoiceNoteRecord(customerInteraction.id, voiceNote);
  }

  return customerInteraction;
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
    const { voiceNote } = await createVoiceNoteRecord(customerInteraction.id);

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
    assert.equal(response.body.customerInteraction.voiceNoteId, voiceNote.id);
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
    assert.equal(response.body.customerInteractions[0].voiceNoteId, null);
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
    assert.equal(response.body.customerInteraction.voiceNoteId, null);
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

  it("creates a walk-in customer interaction with a voice note", async () => {
    const accessToken = await registerAndAuthenticate();
    const voiceNotePayload = buildVoiceNotePayload();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          voiceNote: voiceNotePayload,
        }),
      );

    assert.equal(response.status, 201);
    assert.equal(
      response.body.customerInteraction.interactionType,
      CustomerInteractionType.WALK_IN,
    );
    assert.ok(typeof response.body.customerInteraction.voiceNoteId === "string");

    const storedVoiceNote = await prisma.voiceNote.findUnique({
      where: {
        id: response.body.customerInteraction.voiceNoteId,
      },
      select: {
        id: true,
        customerInteractionId: true,
        file: {
          select: {
            gcsPath: true,
            extension: true,
            originalName: true,
          },
        },
      },
    });

    assert.deepEqual(storedVoiceNote, {
      id: response.body.customerInteraction.voiceNoteId,
      customerInteractionId: response.body.customerInteraction.id,
      file: {
        gcsPath: voiceNotePayload.gcsPath,
        extension: voiceNotePayload.extension,
        originalName: voiceNotePayload.originalName,
      },
    });
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

  it("rejects creating a non-walk-in customer interaction with a voice note", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.PHONE_IN,
          voiceNote: buildVoiceNotePayload(),
        }),
      );

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "voiceNote is only allowed for WALK_IN customer interactions.",
    );
  });

  it("rejects create requests that include clearVoiceNote", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
        }),
        clearVoiceNote: true,
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "clearVoiceNote is only allowed when updating a customer interaction.",
    );
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

  it("returns 409 when creating a walk-in voice note with a duplicate gcsPath", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingFile = await createFileRecord();

    const response = await api
      .post("/customer-interactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          voiceNote: buildVoiceNotePayload({
            gcsPath: existingFile.gcsPath,
          }),
        }),
      );

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "A file with that gcsPath already exists.");
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

  it("adds a voice note on update when none exists", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });
    const voiceNotePayload = buildVoiceNotePayload();

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          voiceNote: voiceNotePayload,
        }),
      );

    assert.equal(response.status, 200);
    assert.ok(typeof response.body.customerInteraction.voiceNoteId === "string");

    const storedVoiceNote = await prisma.voiceNote.findUnique({
      where: {
        id: response.body.customerInteraction.voiceNoteId,
      },
      select: {
        customerInteractionId: true,
        file: {
          select: {
            gcsPath: true,
            extension: true,
            originalName: true,
          },
        },
      },
    });

    assert.deepEqual(storedVoiceNote, {
      customerInteractionId: existingCustomerInteraction.id,
      file: {
        gcsPath: voiceNotePayload.gcsPath,
        extension: voiceNotePayload.extension,
        originalName: voiceNotePayload.originalName,
      },
    });
  });

  it("updates an existing voice note in place", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });
    const { voiceNote, file } = await createVoiceNoteRecord(existingCustomerInteraction.id, {
      gcsPath: `voice-notes/${crypto.randomUUID()}-old.m4a`,
      originalName: "old-note.m4a",
    });
    const updatedVoiceNotePayload = buildVoiceNotePayload({
      gcsPath: `voice-notes/${crypto.randomUUID()}-new.m4a`,
      originalName: "new-note.m4a",
    });

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          voiceNote: updatedVoiceNotePayload,
        }),
      );

    assert.equal(response.status, 200);
    assert.equal(response.body.customerInteraction.voiceNoteId, voiceNote.id);

    const storedVoiceNote = await prisma.voiceNote.findUnique({
      where: {
        id: voiceNote.id,
      },
      select: {
        id: true,
        fileId: true,
        file: {
          select: {
            gcsPath: true,
            extension: true,
            originalName: true,
          },
        },
      },
    });

    assert.deepEqual(storedVoiceNote, {
      id: voiceNote.id,
      fileId: file.id,
      file: {
        gcsPath: updatedVoiceNotePayload.gcsPath,
        extension: updatedVoiceNotePayload.extension,
        originalName: updatedVoiceNotePayload.originalName,
      },
    });
  });

  it("preserves an existing voice note when voiceNote is omitted on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });
    const { voiceNote } = await createVoiceNoteRecord(existingCustomerInteraction.id);

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          occurredAt: "2026-04-21T09:00:00.000Z",
        }),
      );

    assert.equal(response.status, 200);
    assert.equal(response.body.customerInteraction.voiceNoteId, voiceNote.id);
  });

  it("preserves an existing voice note when voiceNote is null on update", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });
    const { voiceNote } = await createVoiceNoteRecord(existingCustomerInteraction.id);

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          voiceNote: null,
        }),
      );

    assert.equal(response.status, 200);
    assert.equal(response.body.customerInteraction.voiceNoteId, voiceNote.id);
  });

  it("clears an existing voice note when clearVoiceNote is true", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });
    const { voiceNote, file } = await createVoiceNoteRecord(existingCustomerInteraction.id);

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          voiceNote: null,
        }),
        clearVoiceNote: true,
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.customerInteraction.voiceNoteId, null);

    const [storedVoiceNote, storedFile] = await Promise.all([
      prisma.voiceNote.findUnique({
        where: {
          id: voiceNote.id,
        },
      }),
      prisma.file.findUnique({
        where: {
          id: file.id,
        },
      }),
    ]);

    assert.equal(storedVoiceNote, null);
    assert.equal(storedFile, null);
  });

  it("allows changing away from walk in when clearVoiceNote is true", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });
    const { voiceNote } = await createVoiceNoteRecord(existingCustomerInteraction.id);

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.PHONE_IN,
          voiceNote: null,
        }),
        clearVoiceNote: true,
      });

    assert.equal(response.status, 200);
    assert.equal(
      response.body.customerInteraction.interactionType,
      CustomerInteractionType.PHONE_IN,
    );
    assert.equal(response.body.customerInteraction.voiceNoteId, null);

    const storedVoiceNote = await prisma.voiceNote.findUnique({
      where: {
        id: voiceNote.id,
      },
    });

    assert.equal(storedVoiceNote, null);
  });

  it("rejects updating a non-walk-in customer interaction with a voice note", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.PHONE_IN,
    });

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.PHONE_IN,
          voiceNote: buildVoiceNotePayload(),
        }),
      );

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "voiceNote is only allowed for WALK_IN customer interactions.",
    );
  });

  it("rejects changing away from walk in when a voice note exists unless clearVoiceNote is true", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });
    await createVoiceNoteRecord(existingCustomerInteraction.id);

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.PHONE_IN,
        }),
      );

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "clearVoiceNote must be true when changing a walk-in with a voice note away from WALK_IN.",
    );
  });

  it("rejects update requests that combine clearVoiceNote with a voiceNote payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });

    const response = await api
      .put(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...buildCustomerInteractionPayload({
          interactionType: CustomerInteractionType.WALK_IN,
          voiceNote: buildVoiceNotePayload(),
        }),
        clearVoiceNote: true,
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "clearVoiceNote cannot be true when voiceNote is provided.",
    );
  });

  it("associates one event booking with a customer interaction", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createEventBookingReferences();
    const eventBooking = await createEventBookingRecord(references);
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildAssociateEventBookingsPayload([eventBooking.id]));

    assert.equal(response.status, 200);
    assert.equal(response.body.customerInteraction.id, existingCustomerInteraction.id);
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, [eventBooking.id]);
    assert.equal(response.body.customerInteraction.ignored, false);
  });

  it("associates multiple event bookings with a customer interaction", async () => {
    const accessToken = await registerAndAuthenticate();
    const firstReferences = await createEventBookingReferences();
    const secondReferences = await createEventBookingReferences();
    const firstEventBooking = await createEventBookingRecord(firstReferences);
    const secondEventBooking = await createEventBookingRecord(secondReferences);
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildAssociateEventBookingsPayload([secondEventBooking.id, firstEventBooking.id]));

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, [
      firstEventBooking.id,
      secondEventBooking.id,
    ].sort());
  });

  it("preserves existing event booking links when associating more", async () => {
    const accessToken = await registerAndAuthenticate();
    const originalReferences = await createEventBookingReferences();
    const additionalReferences = await createEventBookingReferences();
    const originalEventBooking = await createEventBookingRecord(originalReferences);
    const additionalEventBooking = await createEventBookingRecord(additionalReferences);
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      eventBookingIds: [originalEventBooking.id],
    });

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildAssociateEventBookingsPayload([additionalEventBooking.id]));

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, [
      additionalEventBooking.id,
      originalEventBooking.id,
    ].sort());
  });

  it("deduplicates event booking ids when associating bookings", async () => {
    const accessToken = await registerAndAuthenticate();
    const firstReferences = await createEventBookingReferences();
    const secondReferences = await createEventBookingReferences();
    const firstEventBooking = await createEventBookingRecord(firstReferences);
    const secondEventBooking = await createEventBookingRecord(secondReferences);
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildAssociateEventBookingsPayload([
          firstEventBooking.id,
          firstEventBooking.id,
          secondEventBooking.id,
        ]),
      );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, [
      firstEventBooking.id,
      secondEventBooking.id,
    ].sort());
  });

  it("is idempotent when associating already linked event bookings", async () => {
    const accessToken = await registerAndAuthenticate();
    const firstReferences = await createEventBookingReferences();
    const secondReferences = await createEventBookingReferences();
    const firstEventBooking = await createEventBookingRecord(firstReferences);
    const secondEventBooking = await createEventBookingRecord(secondReferences);
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      eventBookingIds: [firstEventBooking.id],
    });

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildAssociateEventBookingsPayload([firstEventBooking.id, secondEventBooking.id]));

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.customerInteraction.eventBookingIds, [
      firstEventBooking.id,
      secondEventBooking.id,
    ].sort());
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

  it("returns not found when associating event bookings for an unknown customer interaction", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createEventBookingReferences();
    const eventBooking = await createEventBookingRecord(references);

    const response = await api
      .patch(`/customer-interactions/${crypto.randomUUID()}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildAssociateEventBookingsPayload([eventBooking.id]));

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

  it("rejects association requests without eventBookingIds", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "eventBookingIds must be an array.");
  });

  it("rejects association requests with a non-array eventBookingIds value", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildAssociateEventBookingsPayload("not-an-array"));

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "eventBookingIds must be an array.");
  });

  it("rejects association requests with invalid event booking ids", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildAssociateEventBookingsPayload([null]));

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "eventBookingIds[0] is required.");
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

  it("returns not found when associating an unknown event booking id", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildAssociateEventBookingsPayload([crypto.randomUUID()]));

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event booking not found.");
  });

  it("requires authentication when associating event bookings", async () => {
    const existingCustomerInteraction = await createCustomerInteractionRecord();

    const response = await api
      .patch(`/customer-interactions/${existingCustomerInteraction.id}/event-bookings`)
      .send(buildAssociateEventBookingsPayload([]));

    assert.equal(response.status, 401);
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

  it("deletes a customer interaction and cleans up its voice note and file", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });
    const { voiceNote, file } = await createVoiceNoteRecord(existingCustomerInteraction.id);

    const response = await api
      .delete(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const [storedCustomerInteraction, storedVoiceNote, storedFile] = await Promise.all([
      prisma.customerInteraction.findUnique({
        where: {
          id: existingCustomerInteraction.id,
        },
      }),
      prisma.voiceNote.findUnique({
        where: {
          id: voiceNote.id,
        },
      }),
      prisma.file.findUnique({
        where: {
          id: file.id,
        },
      }),
    ]);

    assert.equal(storedCustomerInteraction, null);
    assert.equal(storedVoiceNote, null);
    assert.equal(storedFile, null);
  });

  it("preserves a voice note file on delete when a call record still references it", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingCustomerInteraction = await createCustomerInteractionRecord({
      interactionType: CustomerInteractionType.WALK_IN,
    });
    const { voiceNote, file } = await createVoiceNoteRecord(existingCustomerInteraction.id);
    await prisma.callRecord.create({
      data: {
        callerNumber: "9876543210",
        receiverNumber: "9123456780",
        fileId: file.id,
      },
    });

    const response = await api
      .delete(`/customer-interactions/${existingCustomerInteraction.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const [storedVoiceNote, storedFile] = await Promise.all([
      prisma.voiceNote.findUnique({
        where: {
          id: voiceNote.id,
        },
      }),
      prisma.file.findUnique({
        where: {
          id: file.id,
        },
      }),
    ]);

    assert.equal(storedVoiceNote, null);
    assert.notEqual(storedFile, null);
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
