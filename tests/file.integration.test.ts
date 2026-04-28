import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const fileEventBookingColumnExists = await (async () => {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'File'
        AND column_name = 'eventBookingId'
    ) AS "exists"
  `;

  return result[0]?.exists ?? false;
})();

const createEventBookingRecord = async () => {
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

  return prisma.eventBooking.create({
    data: {
      mode: "PHONE_IN",
      eventStatusId: eventStatus.id,
      eventTypeId: eventType.id,
      bookingStart: new Date("2026-04-20T10:00:00.000Z"),
      bookingEnd: new Date("2026-04-20T12:00:00.000Z"),
      customerName: "Priya Sharma",
      phoneNumber1: "9876543210",
    },
  });
};

const createFileRecord = async () => {
  return prisma.file.create({
    data: {
      gcsPath: `files/${crypto.randomUUID()}.pdf`,
      extension: "pdf",
      originalName: "booking-notes.pdf",
    },
  });
};

setupIntegrationTestLifecycle();

describe("file routes", { skip: !fileEventBookingColumnExists }, () => {
  it("rejects unauthenticated create requests", async () => {
    const eventBooking = await createEventBookingRecord();

    const response = await api.post("/files").send({
      gcsPath: `files/${crypto.randomUUID()}.pdf`,
      extension: "pdf",
      originalName: "booking-notes.pdf",
      eventBookingId: eventBooking.id,
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("creates a file with a required event booking id", async () => {
    const accessToken = await registerAndAuthenticate();
    const eventBooking = await createEventBookingRecord();

    const response = await api
      .post("/files")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        gcsPath: `files/${crypto.randomUUID()}.pdf`,
        extension: "pdf",
        originalName: "booking-notes.pdf",
        eventBookingId: eventBooking.id,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.file.gcsPath.endsWith(".pdf"), true);
    assert.equal(response.body.file.extension, "pdf");
    assert.equal(response.body.file.originalName, "booking-notes.pdf");
    assert.equal(response.body.file.eventBookingId, eventBooking.id);

    const storedFiles = await prisma.$queryRaw<Array<{
      id: string;
      gcsPath: string;
      extension: string;
      originalName: string | null;
      eventBookingId: string | null;
    }>>`
      SELECT
        "id",
        "gcsPath",
        "extension",
        "originalName",
        "eventBookingId"
      FROM "File"
      WHERE "id" = ${response.body.file.id}
    `;

    assert.deepEqual(storedFiles[0], {
      id: response.body.file.id,
      gcsPath: response.body.file.gcsPath,
      extension: "pdf",
      originalName: "booking-notes.pdf",
      eventBookingId: eventBooking.id,
    });
  });

  it("returns 404 when creating a file with a missing event booking", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/files")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        gcsPath: `files/${crypto.randomUUID()}.pdf`,
        extension: "pdf",
        originalName: "booking-notes.pdf",
        eventBookingId: crypto.randomUUID(),
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Event booking not found.");
  });

  it("returns 400 when eventBookingId is missing", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/files")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        gcsPath: `files/${crypto.randomUUID()}.pdf`,
        extension: "pdf",
        originalName: "booking-notes.pdf",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "eventBookingId must be a string.");
  });

  it("returns 400 when gcsPath is missing", async () => {
    const accessToken = await registerAndAuthenticate();
    const eventBooking = await createEventBookingRecord();

    const response = await api
      .post("/files")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        extension: "pdf",
        originalName: "booking-notes.pdf",
        eventBookingId: eventBooking.id,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "gcsPath must be a string.");
  });

  it("returns 400 when extension is missing", async () => {
    const accessToken = await registerAndAuthenticate();
    const eventBooking = await createEventBookingRecord();

    const response = await api
      .post("/files")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        gcsPath: `files/${crypto.randomUUID()}.pdf`,
        originalName: "booking-notes.pdf",
        eventBookingId: eventBooking.id,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "extension must be a string.");
  });

  it("returns 409 when creating a file with a duplicate gcsPath", async () => {
    const accessToken = await registerAndAuthenticate();
    const eventBooking = await createEventBookingRecord();
    const existingFile = await createFileRecord();

    const response = await api
      .post("/files")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        gcsPath: existingFile.gcsPath,
        extension: "pdf",
        originalName: "booking-notes.pdf",
        eventBookingId: eventBooking.id,
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "A file with that gcsPath already exists.");
  });
});
