import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/lib/prisma.js";
import { setupIntegrationTestLifecycle } from "./integration-test-utils.js";

const isServiceAmountCheckConstraintError = (error: unknown): boolean => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2004"
  ) {
    return true;
  }

  return (
    error instanceof Error &&
    error.message.includes('Service_commissionAmount_check')
  );
};

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

setupIntegrationTestLifecycle();

describe("service model", { skip: !serviceTableExists }, () => {
  it("creates a service with both amounts", async () => {
    const { serviceProvider, eventBooking } = await createReferences();

    const service = await prisma.service.create({
      data: {
        serviceProviderId: serviceProvider.id,
        eventBookingId: eventBooking.id,
        contractedAmount: new Prisma.Decimal("12500.50"),
        commissionAmount: new Prisma.Decimal("1500.25"),
      },
    });

    assert.equal(service.serviceProviderId, serviceProvider.id);
    assert.equal(service.eventBookingId, eventBooking.id);
    assert.equal(service.contractedAmount?.toString(), "12500.5");
    assert.equal(service.commissionAmount?.toString(), "1500.25");
  });

  it("creates a service with only contracted amount", async () => {
    const { serviceProvider, eventBooking } = await createReferences();

    const service = await prisma.service.create({
      data: {
        serviceProviderId: serviceProvider.id,
        eventBookingId: eventBooking.id,
        contractedAmount: new Prisma.Decimal("9000.00"),
      },
    });

    assert.equal(service.contractedAmount?.toString(), "9000");
    assert.equal(service.commissionAmount, null);
  });

  it("rejects a negative contracted amount", async () => {
    const { serviceProvider, eventBooking } = await createReferences();

    await assert.rejects(
      prisma.service.create({
        data: {
          serviceProviderId: serviceProvider.id,
          eventBookingId: eventBooking.id,
          contractedAmount: new Prisma.Decimal("-1.00"),
        },
      }),
      isServiceAmountCheckConstraintError,
    );
  });

  it("rejects a negative commission amount", async () => {
    const { serviceProvider, eventBooking } = await createReferences();

    await assert.rejects(
      prisma.service.create({
        data: {
          serviceProviderId: serviceProvider.id,
          eventBookingId: eventBooking.id,
          contractedAmount: new Prisma.Decimal("100.00"),
          commissionAmount: new Prisma.Decimal("-1.00"),
        },
      }),
      isServiceAmountCheckConstraintError,
    );
  });

  it("rejects a commission amount when contracted amount is null", async () => {
    const { serviceProvider, eventBooking } = await createReferences();

    await assert.rejects(
      prisma.service.create({
        data: {
          serviceProviderId: serviceProvider.id,
          eventBookingId: eventBooking.id,
          commissionAmount: new Prisma.Decimal("500.00"),
        },
      }),
      isServiceAmountCheckConstraintError,
    );
  });

  it("rejects a commission amount that is not less than contracted amount", async () => {
    const { serviceProvider, eventBooking } = await createReferences();

    await assert.rejects(
      prisma.service.create({
        data: {
          serviceProviderId: serviceProvider.id,
          eventBookingId: eventBooking.id,
          contractedAmount: new Prisma.Decimal("5000.00"),
          commissionAmount: new Prisma.Decimal("5000.00"),
        },
      }),
      isServiceAmountCheckConstraintError,
    );
  });

  it("rejects duplicate service provider and event booking pairs", async () => {
    const { serviceProvider, eventBooking } = await createReferences();

    await prisma.service.create({
      data: {
        serviceProviderId: serviceProvider.id,
        eventBookingId: eventBooking.id,
      },
    });

    await assert.rejects(
      prisma.service.create({
        data: {
          serviceProviderId: serviceProvider.id,
          eventBookingId: eventBooking.id,
        },
      }),
      (error: unknown) => {
        return (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        );
      },
    );
  });
});
