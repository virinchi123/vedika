import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const serviceTableExists = await (async () => {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'Service'
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
  const serviceProvider = await prisma.serviceProvider.create({
    data: {
      name: `Service Provider ${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@example.com`,
    },
  });
  const eventBooking = await prisma.eventBooking.create({
    data: {
      mode: "PHONE_IN",
      bookingStatusId: bookingStatus.id,
      eventStatusId: eventStatus.id,
      eventTypeId: eventType.id,
      bookingStart: new Date("2026-04-20T10:00:00.000Z"),
      bookingEnd: new Date("2026-04-20T12:00:00.000Z"),
      customerName: "Priya Sharma",
      phoneNumber1: "9876543210",
    },
  });

  return {
    serviceProvider,
    eventBooking,
  };
};

const createServiceRecord = async (
  overrides: Partial<{
    contractedAmount: Prisma.Decimal | null;
    commissionAmount: Prisma.Decimal | null;
  }> = {},
) => {
  const references = await createReferences();

  const service = await prisma.service.create({
    data: {
      serviceProviderId: references.serviceProvider.id,
      eventBookingId: references.eventBooking.id,
      contractedAmount: new Prisma.Decimal("12000.00"),
      commissionAmount: new Prisma.Decimal("1200.00"),
      ...overrides,
    },
  });

  return {
    service,
    references,
  };
};

setupIntegrationTestLifecycle();

describe("service api routes", { skip: !serviceTableExists }, () => {
  it("gets a service by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .get(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.service.id, service.id);
    assert.equal(response.body.service.contractedAmount, "12000.00");
    assert.equal(response.body.service.commissionAmount, "1200.00");
  });

  it("returns not found when getting an unknown service", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .get(`/services/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Service not found.");
  });

  it("rejects unauthenticated get requests", async () => {
    const { service } = await createServiceRecord();

    const response = await api.get(`/services/${service.id}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("updates only contracted amount", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: "15000.25",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.service.contractedAmount, "15000.25");
    assert.equal(response.body.service.commissionAmount, "1200.00");
  });

  it("updates only commission amount", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        commissionAmount: "1100.10",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.service.contractedAmount, "12000.00");
    assert.equal(response.body.service.commissionAmount, "1100.10");
  });

  it("updates both amounts together", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: "14000.00",
        commissionAmount: "1000.50",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.service.contractedAmount, "14000.00");
    assert.equal(response.body.service.commissionAmount, "1000.50");
  });

  it("clears one or both amounts with null", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const firstResponse = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        commissionAmount: null,
      });

    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.body.service.contractedAmount, "12000.00");
    assert.equal(firstResponse.body.service.commissionAmount, null);

    const secondResponse = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: null,
      });

    assert.equal(secondResponse.status, 200);
    assert.equal(secondResponse.body.service.contractedAmount, null);
    assert.equal(secondResponse.body.service.commissionAmount, null);
  });

  it("preserves omitted fields on patch", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord({
      contractedAmount: new Prisma.Decimal("10000.00"),
      commissionAmount: null,
    });

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: "11000.00",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.service.contractedAmount, "11000.00");
    assert.equal(response.body.service.commissionAmount, null);
  });

  it("rejects extra fields in the payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: "13000.00",
        serviceProviderId: crypto.randomUUID(),
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "Only contractedAmount and commissionAmount can be updated.",
    );
  });

  it("rejects an empty patch payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "At least one of contractedAmount or commissionAmount must be provided.",
    );
  });

  it("rejects a negative contracted amount", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: "-1.00",
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "contractedAmount must be a decimal string with up to 2 decimal places or null.",
    );
  });

  it("rejects a negative commission amount", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        commissionAmount: "-1.00",
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "commissionAmount must be a decimal string with up to 2 decimal places or null.",
    );
  });

  it("rejects commissionAmount without an effective contractedAmount", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord({
      contractedAmount: null,
      commissionAmount: null,
    });

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        commissionAmount: "200.00",
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "contractedAmount is required when commissionAmount is provided.",
    );
  });

  it("rejects commissionAmount greater than or equal to contractedAmount", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        commissionAmount: "12000.00",
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "commissionAmount must be less than contractedAmount.",
    );
  });

  it("returns not found when updating an unknown service", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .patch(`/services/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: "100.00",
      });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Service not found.");
  });

  it("rejects unauthenticated update requests", async () => {
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .send({
        contractedAmount: "100.00",
      });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });
});
