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
      commissionRate: 12,
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

type ServiceAmountOverrides = Partial<{
  contractedAmount: Prisma.Decimal | null;
  customerPaidAmount: Prisma.Decimal | null;
  grossCommission: Prisma.Decimal | null;
  deduction: Prisma.Decimal | null;
  commissionPaidAmount: Prisma.Decimal | null;
}>;

const createServiceRecord = async (overrides: ServiceAmountOverrides = {}) => {
  const references = await createReferences();

  const service = await prisma.service.create({
    data: {
      serviceProviderId: references.serviceProvider.id,
      eventBookingId: references.eventBooking.id,
      contractedAmount: new Prisma.Decimal("12000.00"),
      customerPaidAmount: new Prisma.Decimal("11800.00"),
      grossCommission: new Prisma.Decimal("1200.00"),
      deduction: new Prisma.Decimal("50.00"),
      commissionPaidAmount: new Prisma.Decimal("1150.00"),
      ...overrides,
    },
  });

  return {
    service,
    references,
  };
};

const assertServiceAmounts = (
  service: Record<string, unknown>,
  expected: {
    contractedAmount: string | null;
    customerPaidAmount: string | null;
    grossCommission: string | null;
    deduction: string | null;
    commissionPaidAmount: string | null;
  },
) => {
  assert.equal(service.contractedAmount, expected.contractedAmount);
  assert.equal(service.customerPaidAmount, expected.customerPaidAmount);
  assert.equal(service.grossCommission, expected.grossCommission);
  assert.equal(service.deduction, expected.deduction);
  assert.equal(service.commissionPaidAmount, expected.commissionPaidAmount);
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
    assertServiceAmounts(response.body.service, {
      contractedAmount: "12000.00",
      customerPaidAmount: "11800.00",
      grossCommission: "1200.00",
      deduction: "50.00",
      commissionPaidAmount: "1150.00",
    });
    assert.equal("commissionAmount" in response.body.service, false);
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

  for (const {
    fieldName,
    value,
    expected,
  } of [
    {
      fieldName: "contractedAmount",
      value: "15000.25",
      expected: {
        contractedAmount: "15000.25",
        customerPaidAmount: "11800.00",
        grossCommission: "1200.00",
        deduction: "50.00",
        commissionPaidAmount: "1150.00",
      },
    },
    {
      fieldName: "customerPaidAmount",
      value: "11750.10",
      expected: {
        contractedAmount: "12000.00",
        customerPaidAmount: "11750.10",
        grossCommission: "1200.00",
        deduction: "50.00",
        commissionPaidAmount: "1150.00",
      },
    },
    {
      fieldName: "grossCommission",
      value: "1100.10",
      expected: {
        contractedAmount: "12000.00",
        customerPaidAmount: "11800.00",
        grossCommission: "1100.10",
        deduction: "50.00",
        commissionPaidAmount: "1150.00",
      },
    },
    {
      fieldName: "deduction",
      value: "75.25",
      expected: {
        contractedAmount: "12000.00",
        customerPaidAmount: "11800.00",
        grossCommission: "1200.00",
        deduction: "75.25",
        commissionPaidAmount: "1150.00",
      },
    },
    {
      fieldName: "commissionPaidAmount",
      value: "1124.75",
      expected: {
        contractedAmount: "12000.00",
        customerPaidAmount: "11800.00",
        grossCommission: "1200.00",
        deduction: "50.00",
        commissionPaidAmount: "1124.75",
      },
    },
  ] as const) {
    it(`updates only ${fieldName}`, async () => {
      const accessToken = await registerAndAuthenticate();
      const { service } = await createServiceRecord();

      const response = await api
        .patch(`/services/${service.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          [fieldName]: value,
        });

      assert.equal(response.status, 200);
      assertServiceAmounts(response.body.service, expected);
    });
  }

  it("updates multiple financial fields together", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: "14000.00",
        grossCommission: "1000.50",
        commissionPaidAmount: "960.25",
      });

    assert.equal(response.status, 200);
    assertServiceAmounts(response.body.service, {
      contractedAmount: "14000.00",
      customerPaidAmount: "11800.00",
      grossCommission: "1000.50",
      deduction: "50.00",
      commissionPaidAmount: "960.25",
    });
  });

  it("clears one or more financial fields with null", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const firstResponse = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        grossCommission: null,
      });

    assert.equal(firstResponse.status, 200);
    assertServiceAmounts(firstResponse.body.service, {
      contractedAmount: "12000.00",
      customerPaidAmount: "11800.00",
      grossCommission: null,
      deduction: "50.00",
      commissionPaidAmount: "1150.00",
    });

    const secondResponse = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: null,
        customerPaidAmount: null,
        deduction: null,
        commissionPaidAmount: null,
      });

    assert.equal(secondResponse.status, 200);
    assertServiceAmounts(secondResponse.body.service, {
      contractedAmount: null,
      customerPaidAmount: null,
      grossCommission: null,
      deduction: null,
      commissionPaidAmount: null,
    });
  });

  it("preserves omitted fields on patch", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord({
      contractedAmount: new Prisma.Decimal("10000.00"),
      customerPaidAmount: null,
      grossCommission: new Prisma.Decimal("900.00"),
      deduction: null,
      commissionPaidAmount: new Prisma.Decimal("850.00"),
    });

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        contractedAmount: "11000.00",
      });

    assert.equal(response.status, 200);
    assertServiceAmounts(response.body.service, {
      contractedAmount: "11000.00",
      customerPaidAmount: null,
      grossCommission: "900.00",
      deduction: null,
      commissionPaidAmount: "850.00",
    });
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
      "Only contractedAmount, customerPaidAmount, grossCommission, deduction, and commissionPaidAmount can be updated.",
    );
  });

  it("rejects the removed commissionAmount field", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        commissionAmount: "100.00",
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "Only contractedAmount, customerPaidAmount, grossCommission, deduction, and commissionPaidAmount can be updated.",
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
      "At least one of contractedAmount, customerPaidAmount, grossCommission, deduction, or commissionPaidAmount must be provided.",
    );
  });

  for (const fieldName of [
    "contractedAmount",
    "customerPaidAmount",
    "grossCommission",
    "deduction",
    "commissionPaidAmount",
  ] as const) {
    it(`rejects a negative ${fieldName}`, async () => {
      const accessToken = await registerAndAuthenticate();
      const { service } = await createServiceRecord();

      const response = await api
        .patch(`/services/${service.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          [fieldName]: "-1.00",
        });

      assert.equal(response.status, 400);
      assert.equal(
        response.body.error,
        `${fieldName} must be greater than or equal to 0.`,
      );
    });
  }

  it("rejects malformed decimal strings", async () => {
    const accessToken = await registerAndAuthenticate();
    const { service } = await createServiceRecord();

    const response = await api
      .patch(`/services/${service.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        grossCommission: "12.345",
      });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      "grossCommission must be a decimal string with up to 2 decimal places or null.",
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
