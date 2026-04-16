import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const createFileRecord = async () => {
  return prisma.file.create({
    data: {
      gcsPath: `call-recordings/${crypto.randomUUID()}.mp3`,
      extension: "mp3",
      originalName: "recording.mp3",
    },
  });
};

const createCallRecordRecord = async ({
  callerNumber,
  receiverNumber,
  createdAt,
  fileId = null,
}: {
  callerNumber: string;
  receiverNumber: string;
  createdAt: string;
  fileId?: string | null;
}) => {
  return prisma.callRecord.create({
    data: {
      callerNumber,
      receiverNumber,
      fileId,
      createdAt: new Date(createdAt),
    },
  });
};

setupIntegrationTestLifecycle();

describe("call record routes", () => {
  it("rejects unauthenticated list requests", async () => {
    const response = await api.get("/call-records");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects unauthenticated get-by-id requests", async () => {
    const callRecord = await createCallRecordRecord({
      callerNumber: "9876543210",
      receiverNumber: "9123456780",
      createdAt: "2026-04-12T10:00:00.000Z",
    });

    const response = await api.get(`/call-records/${callRecord.id}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects unauthenticated create requests", async () => {
    const response = await api.post("/call-records").send({
      callerNumber: "9876543210",
      receiverNumber: "9123456780",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("creates a call record with normalized phone numbers", async () => {
    const accessToken = await registerAndAuthenticate();
    const file = await createFileRecord();

    const response = await api
      .post("/call-records")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        callerNumber: "+91 98765 43210",
        receiverNumber: "09123456780",
        fileId: file.id,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.callRecord.callerNumber, "9876543210");
    assert.equal(response.body.callRecord.receiverNumber, "9123456780");
    assert.equal(response.body.callRecord.fileId, file.id);

    const storedCallRecord = await prisma.callRecord.findUnique({
      where: {
        id: response.body.callRecord.id,
      },
    });

    assert.ok(storedCallRecord);
    assert.equal(storedCallRecord.callerNumber, "9876543210");
    assert.equal(storedCallRecord.receiverNumber, "9123456780");
  });

  it("creates a call record when fileId is omitted", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/call-records")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        callerNumber: "9876543210",
        receiverNumber: "9123456780",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.callRecord.fileId, null);
  });

  it("creates a call record when fileId is null", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/call-records")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        callerNumber: "9876543210",
        receiverNumber: "9123456780",
        fileId: null,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.callRecord.fileId, null);
  });

  it("returns 404 when creating a call record with a missing file", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/call-records")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        callerNumber: "9876543210",
        receiverNumber: "9123456780",
        fileId: crypto.randomUUID(),
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "File not found.");
  });

  it("gets a call record by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const file = await createFileRecord();
    const callRecord = await createCallRecordRecord({
      callerNumber: "9876543210",
      receiverNumber: "9123456780",
      createdAt: "2026-04-12T10:00:00.000Z",
      fileId: file.id,
    });

    const response = await api
      .get(`/call-records/${callRecord.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.callRecord.id, callRecord.id);
    assert.equal(response.body.callRecord.fileId, file.id);
  });

  it("returns 404 when a call record does not exist", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get(`/call-records/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Call record not found.");
  });

  it("lists call records with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    await createCallRecordRecord({
      callerNumber: "9000000001",
      receiverNumber: "9111111111",
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    const middleCallRecord = await createCallRecordRecord({
      callerNumber: "9000000002",
      receiverNumber: "9222222222",
      createdAt: "2026-04-11T10:00:00.000Z",
    });
    const newestCallRecord = await createCallRecordRecord({
      callerNumber: "9000000003",
      receiverNumber: "9333333333",
      createdAt: "2026-04-12T10:00:00.000Z",
    });

    const response = await api
      .get("/call-records")
      .query({
        limit: "2",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.callRecords.map((callRecord: { id: string }) => callRecord.id),
      [newestCallRecord.id, middleCallRecord.id],
    );
    assert.equal(response.body.pageInfo.limit, 2);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("lists the next page when a cursor is provided", async () => {
    const accessToken = await registerAndAuthenticate();
    await createCallRecordRecord({
      callerNumber: "9000000001",
      receiverNumber: "9111111111",
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    const middleCallRecord = await createCallRecordRecord({
      callerNumber: "9000000002",
      receiverNumber: "9222222222",
      createdAt: "2026-04-11T10:00:00.000Z",
    });
    await createCallRecordRecord({
      callerNumber: "9000000003",
      receiverNumber: "9333333333",
      createdAt: "2026-04-12T10:00:00.000Z",
    });

    const firstPageResponse = await api
      .get("/call-records")
      .query({
        limit: "1",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(firstPageResponse.status, 200);
    assert.ok(typeof firstPageResponse.body.pageInfo.nextCursor === "string");

    const response = await api
      .get("/call-records")
      .query({
        limit: "1",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.callRecords.map((callRecord: { id: string }) => callRecord.id),
      [middleCallRecord.id],
    );
    assert.equal(response.body.pageInfo.limit, 1);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("filters call records by caller number", async () => {
    const accessToken = await registerAndAuthenticate();
    const callerMatch = await createCallRecordRecord({
      callerNumber: "8000000001",
      receiverNumber: "9000000000",
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    await createCallRecordRecord({
      callerNumber: "8000000002",
      receiverNumber: "9000000001",
      createdAt: "2026-04-11T10:00:00.000Z",
    });

    const response = await api
      .get("/call-records")
      .query({
        phoneNumber: "8000000001",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.callRecords.map((callRecord: { id: string }) => callRecord.id),
      [callerMatch.id],
    );
  });

  it("filters call records by receiver number", async () => {
    const accessToken = await registerAndAuthenticate();
    await createCallRecordRecord({
      callerNumber: "8000000001",
      receiverNumber: "9000000000",
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    const receiverMatch = await createCallRecordRecord({
      callerNumber: "8000000002",
      receiverNumber: "9000000001",
      createdAt: "2026-04-11T10:00:00.000Z",
    });

    const response = await api
      .get("/call-records")
      .query({
        phoneNumber: "9000000001",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.callRecords.map((callRecord: { id: string }) => callRecord.id),
      [receiverMatch.id],
    );
  });

  it("filters call records using India-aware phone normalization", async () => {
    const accessToken = await registerAndAuthenticate();
    const matchingCallRecord = await createCallRecordRecord({
      callerNumber: "9876543210",
      receiverNumber: "9000000001",
      createdAt: "2026-04-11T10:00:00.000Z",
    });
    await createCallRecordRecord({
      callerNumber: "9999999999",
      receiverNumber: "9000000002",
      createdAt: "2026-04-12T10:00:00.000Z",
    });

    const response = await api
      .get("/call-records")
      .query({
        phoneNumber: "+91 98765 43210",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.callRecords.map((callRecord: { id: string }) => callRecord.id),
      [matchingCallRecord.id],
    );
  });

  it("rejects invalid pagination params", async () => {
    const accessToken = await registerAndAuthenticate();

    const invalidLimitResponse = await api
      .get("/call-records")
      .query({
        limit: "0",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidLimitResponse.status, 400);
    assert.equal(invalidLimitResponse.body.error, "limit must be a positive integer.");

    const invalidCursorResponse = await api
      .get("/call-records")
      .query({
        cursor: "not-a-valid-cursor",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidCursorResponse.status, 400);
    assert.equal(invalidCursorResponse.body.error, "cursor must be a valid cursor.");
  });

  it("rejects invalid create phone inputs", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/call-records")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        callerNumber: "12345",
        receiverNumber: "9123456780",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "callerNumber must be a valid Indian phone number.");
  });

  it("rejects invalid list phone filters", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get("/call-records")
      .query({
        phoneNumber: "12345",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "phoneNumber must be a valid Indian phone number.");
  });
});
