import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const paymentTableExists = await (async () => {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'Payment'
    ) AS "exists"
  `;

  return result[0]?.exists ?? false;
})();

const createFileRecord = async () => {
  return prisma.file.create({
    data: {
      gcsPath: `payments/${crypto.randomUUID()}.png`,
      extension: "png",
      originalName: "payment-proof.png",
    },
  });
};

const createServiceRecord = async () => {
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
      commissionRate: 10,
    },
  });
  const eventBooking = await prisma.eventBooking.create({
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

  const service = await prisma.service.create({
    data: {
      serviceProviderId: serviceProvider.id,
      eventBookingId: eventBooking.id,
    },
  });

  return {
    service,
    eventBooking,
  };
};

const createPaymentRecord = async ({
  serviceId,
  paymentProofFileId = null,
  createdAt = "2026-04-12T10:00:00.000Z",
  mode = "UPI",
  amount = new Prisma.Decimal("1200.00"),
  date = new Date("2026-04-12T00:00:00.000Z"),
}: {
  serviceId: string;
  paymentProofFileId?: string | null;
  createdAt?: string;
  mode?: "CASH" | "BANK_TRANSFER" | "UPI";
  amount?: Prisma.Decimal;
  date?: Date;
}) => {
  return prisma.payment.create({
    data: {
      serviceId,
      paymentProofFileId,
      mode,
      amount,
      date,
      createdAt: new Date(createdAt),
    },
  });
};

setupIntegrationTestLifecycle();

describe("payment routes", { skip: !paymentTableExists }, () => {
  it("rejects unauthenticated list requests", async () => {
    const response = await api.get("/payments");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects unauthenticated get-by-id requests", async () => {
    const { service } = await createServiceRecord();
    const payment = await createPaymentRecord({
      serviceId: service.id,
    });

    const response = await api.get(`/payments/${payment.id}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects unauthenticated create requests", async () => {
    const { service } = await createServiceRecord();

    const response = await api.post("/payments").send({
      mode: "UPI",
      amount: "1200.00",
      date: "2026-04-12",
      serviceId: service.id,
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("creates a payment with an optional proof file", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();
    const file = await createFileRecord();

    const response = await api
      .post("/payments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "BANK_TRANSFER",
        amount: "1200.50",
        date: "2026-04-12",
        serviceId: service.id,
        paymentProofFileId: file.id,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.payment.mode, "BANK_TRANSFER");
    assert.equal(response.body.payment.amount, "1200.50");
    assert.equal(response.body.payment.date, "2026-04-12");
    assert.equal(response.body.payment.serviceId, service.id);
    assert.equal(response.body.payment.paymentProofFileId, file.id);
  });

  it("creates a payment when paymentProofFileId is omitted", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .post("/payments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "UPI",
        amount: "800.00",
        date: "2026-04-12",
        serviceId: service.id,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.payment.paymentProofFileId, null);
  });

  it("returns 404 when creating a payment with a missing service", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/payments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "CASH",
        amount: "500.00",
        date: "2026-04-12",
        serviceId: crypto.randomUUID(),
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Service not found.");
  });

  it("returns 404 when creating a payment with a missing proof file", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .post("/payments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "UPI",
        amount: "500.00",
        date: "2026-04-12",
        serviceId: service.id,
        paymentProofFileId: crypto.randomUUID(),
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "File not found.");
  });

  it("gets a payment by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();
    const payment = await createPaymentRecord({
      serviceId: service.id,
    });

    const response = await api
      .get(`/payments/${payment.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.payment.id, payment.id);
    assert.equal(response.body.payment.amount, "1200.00");
    assert.equal(response.body.payment.date, "2026-04-12");
    assert.equal(response.body.payment.serviceId, service.id);
  });

  it("returns 404 when a payment does not exist", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get(`/payments/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Payment not found.");
  });

  it("lists payments with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();
    await createPaymentRecord({
      serviceId: service.id,
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    const middlePayment = await createPaymentRecord({
      serviceId: service.id,
      createdAt: "2026-04-11T10:00:00.000Z",
    });
    const newestPayment = await createPaymentRecord({
      serviceId: service.id,
      createdAt: "2026-04-12T10:00:00.000Z",
    });

    const response = await api
      .get("/payments")
      .query({
        limit: "2",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.payments.map((payment: { id: string }) => payment.id),
      [newestPayment.id, middlePayment.id],
    );
    assert.equal(response.body.pageInfo.limit, 2);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("filters payments by serviceId", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service: firstService } = await createServiceRecord();
    const { service: secondService } = await createServiceRecord();
    const matchingPayment = await createPaymentRecord({
      serviceId: firstService.id,
    });
    await createPaymentRecord({
      serviceId: secondService.id,
    });

    const response = await api
      .get("/payments")
      .query({
        serviceId: firstService.id,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.payments.map((payment: { id: string }) => payment.id),
      [matchingPayment.id],
    );
  });

  it("updates a payment including service and proof file changes", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service: originalService } = await createServiceRecord();
    const { service: replacementService } = await createServiceRecord();
    const originalFile = await createFileRecord();
    const replacementFile = await createFileRecord();
    const payment = await createPaymentRecord({
      serviceId: originalService.id,
      paymentProofFileId: originalFile.id,
    });

    const response = await api
      .put(`/payments/${payment.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "CASH",
        amount: "950.25",
        date: "2026-04-15",
        serviceId: replacementService.id,
        paymentProofFileId: replacementFile.id,
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.payment.mode, "CASH");
    assert.equal(response.body.payment.amount, "950.25");
    assert.equal(response.body.payment.date, "2026-04-15");
    assert.equal(response.body.payment.serviceId, replacementService.id);
    assert.equal(response.body.payment.paymentProofFileId, replacementFile.id);
  });

  it("clears paymentProofFileId on update when null is sent", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();
    const file = await createFileRecord();
    const payment = await createPaymentRecord({
      serviceId: service.id,
      paymentProofFileId: file.id,
    });

    const response = await api
      .put(`/payments/${payment.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "UPI",
        amount: "1200.00",
        date: "2026-04-12",
        serviceId: service.id,
        paymentProofFileId: null,
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.payment.paymentProofFileId, null);
  });

  it("rejects invalid mode values", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .post("/payments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "CARD",
        amount: "1200.00",
        date: "2026-04-12",
        serviceId: service.id,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "mode must be one of CASH, BANK_TRANSFER, UPI.");
  });

  it("rejects malformed amounts", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .post("/payments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "UPI",
        amount: "12.345",
        date: "2026-04-12",
        serviceId: service.id,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "amount must be a decimal string with up to 2 decimal places.");
  });

  it("rejects non-positive amounts", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .post("/payments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "UPI",
        amount: "0.00",
        date: "2026-04-12",
        serviceId: service.id,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "amount must be greater than 0.");
  });

  it("rejects invalid dates", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .post("/payments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "UPI",
        amount: "100.00",
        date: "2026-02-30",
        serviceId: service.id,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "date must be a valid date in YYYY-MM-DD format.");
  });

  it("returns 404 when updating an unknown payment", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .put(`/payments/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mode: "UPI",
        amount: "100.00",
        date: "2026-04-12",
        serviceId: service.id,
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Payment not found.");
  });

  it("rejects unauthenticated update requests", async () => {
    const { service } = await createServiceRecord();
    const payment = await createPaymentRecord({
      serviceId: service.id,
    });

    const response = await api
      .put(`/payments/${payment.id}`)
      .send({
        mode: "UPI",
        amount: "100.00",
        date: "2026-04-12",
        serviceId: service.id,
      });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("deletes payments when the owning event booking is deleted", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service, eventBooking } = await createServiceRecord();
    const payment = await createPaymentRecord({
      serviceId: service.id,
    });

    const response = await api
      .delete(`/event-bookings/${eventBooking.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const storedPayment = await prisma.payment.findUnique({
      where: {
        id: payment.id,
      },
    });

    assert.equal(storedPayment, null);
  });
});
