import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const createBookingStatusRecord = async (name: string, createdAt: string) => {
  return prisma.bookingStatus.create({
    data: {
      name,
      createdAt: new Date(createdAt),
    },
  });
};

setupIntegrationTestLifecycle();

describe("booking status routes", () => {
  it("lists booking statuses with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    await createBookingStatusRecord("Oldest Status", "2026-04-10T10:00:00.000Z");
    await createBookingStatusRecord("Middle Status", "2026-04-11T10:00:00.000Z");
    const newestBookingStatus = await createBookingStatusRecord(
      "Newest Status",
      "2026-04-12T10:00:00.000Z",
    );

    const response = await api
      .get("/booking-statuses")
      .query({
        limit: "2",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.bookingStatuses.map((bookingStatus: { name: string }) => bookingStatus.name),
      ["Newest Status", "Middle Status"],
    );
    assert.equal(response.body.pageInfo.limit, 2);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
    assert.equal(response.body.bookingStatuses[0].id, newestBookingStatus.id);
  });

  it("lists the next page when a cursor is provided", async () => {
    const accessToken = await registerAndAuthenticate();
    await createBookingStatusRecord("Oldest Status", "2026-04-10T10:00:00.000Z");
    await createBookingStatusRecord("Middle Status", "2026-04-11T10:00:00.000Z");
    await createBookingStatusRecord("Newest Status", "2026-04-12T10:00:00.000Z");

    const firstPageResponse = await api
      .get("/booking-statuses")
      .query({
        limit: "1",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(firstPageResponse.status, 200);
    assert.ok(typeof firstPageResponse.body.pageInfo.nextCursor === "string");

    const response = await api
      .get("/booking-statuses")
      .query({
        limit: "1",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.bookingStatuses.map((bookingStatus: { name: string }) => bookingStatus.name),
      ["Middle Status"],
    );
    assert.equal(response.body.pageInfo.limit, 1);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("rejects unauthenticated list requests", async () => {
    const response = await api.get("/booking-statuses");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects invalid pagination params", async () => {
    const accessToken = await registerAndAuthenticate();

    const invalidLimitResponse = await api
      .get("/booking-statuses")
      .query({
        limit: "0",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidLimitResponse.status, 400);
    assert.equal(invalidLimitResponse.body.error, "limit must be a positive integer.");

    const invalidCursorResponse = await api
      .get("/booking-statuses")
      .query({
        cursor: "not-a-valid-cursor",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidCursorResponse.status, 400);
    assert.equal(invalidCursorResponse.body.error, "cursor must be a valid cursor.");
  });

  it("creates a booking status for an authenticated request", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/booking-statuses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "  Confirmed  ",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.bookingStatus.name, "Confirmed");

    const bookingStatus = await prisma.bookingStatus.findUnique({
      where: {
        id: response.body.bookingStatus.id,
      },
    });

    assert.ok(bookingStatus);
    assert.equal(bookingStatus.name, "Confirmed");
  });

  it("rejects unauthenticated create requests", async () => {
    const response = await api.post("/booking-statuses").send({
      name: "Confirmed",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects duplicate names on create", async () => {
    const accessToken = await registerAndAuthenticate();
    await prisma.bookingStatus.create({
      data: {
        name: "Confirmed",
      },
    });

    const response = await api
      .post("/booking-statuses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Confirmed",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "A booking status with that name already exists.");
  });

  it("deletes a booking status by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingBookingStatus = await prisma.bookingStatus.create({
      data: {
        name: "Pending",
      },
    });

    const response = await api
      .delete(`/booking-statuses/${existingBookingStatus.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const bookingStatus = await prisma.bookingStatus.findUnique({
      where: {
        id: existingBookingStatus.id,
      },
    });

    assert.equal(bookingStatus, null);
  });

  it("rejects unauthenticated delete requests", async () => {
    const existingBookingStatus = await prisma.bookingStatus.create({
      data: {
        name: "Pending",
      },
    });

    const response = await api.delete(`/booking-statuses/${existingBookingStatus.id}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("returns not found when deleting an unknown booking status", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .delete("/booking-statuses/missing-booking-status")
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Booking status not found.");
  });
});
