import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {Prisma} from "../src/generated/prisma/client.js";
import {prisma} from "../src/lib/prisma.js";
import {setupIntegrationTestLifecycle} from "./integration-test-utils.js";

const isServiceAmountCheckConstraintError = (error: unknown): boolean => {
    return (
        (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2004"
        ) ||
        (
            error instanceof Error &&
            /Service_.*_check/.test(error.message)
        )
    );
};

const serviceTableExists = await (async () => {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (SELECT 1
                       FROM information_schema.tables
                       WHERE table_schema = current_schema()
                         AND table_name = 'Service') AS "exists"
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
            commissionRate: 10
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

describe("service model", {skip: !serviceTableExists}, () => {
    it("creates a service with all supported financial fields", async () => {
        const {serviceProvider, eventBooking} = await createReferences();

        const service = await prisma.service.create({
            data: {
                serviceProviderId: serviceProvider.id,
                eventBookingId: eventBooking.id,
                contractedAmount: new Prisma.Decimal("12500.50"),
                customerPaidAmount: new Prisma.Decimal("12000.25"),
                grossCommission: new Prisma.Decimal("1500.25"),
                deduction: new Prisma.Decimal("125.10"),
                commissionPaidAmount: new Prisma.Decimal("1375.15"),
            },
        });

        assert.equal(service.serviceProviderId, serviceProvider.id);
        assert.equal(service.eventBookingId, eventBooking.id);
        assert.equal(service.contractedAmount?.toString(), "12500.5");
        assert.equal(service.customerPaidAmount?.toString(), "12000.25");
        assert.equal(service.grossCommission?.toString(), "1500.25");
        assert.equal(service.deduction?.toString(), "125.1");
        assert.equal(service.commissionPaidAmount?.toString(), "1375.15");
    });

    it("creates a service with only some financial fields", async () => {
        const {serviceProvider, eventBooking} = await createReferences();

        const service = await prisma.service.create({
            data: {
                serviceProviderId: serviceProvider.id,
                eventBookingId: eventBooking.id,
                contractedAmount: new Prisma.Decimal("9000.00"),
                customerPaidAmount: new Prisma.Decimal("8750.00"),
            },
        });

        assert.equal(service.contractedAmount?.toString(), "9000");
        assert.equal(service.customerPaidAmount?.toString(), "8750");
        assert.equal(service.grossCommission, null);
        assert.equal(service.deduction, null);
        assert.equal(service.commissionPaidAmount, null);
    });

    for (const fieldName of [
        "contractedAmount",
        "customerPaidAmount",
        "grossCommission",
        "deduction",
        "commissionPaidAmount",
    ] as const) {
        it(`rejects a negative ${fieldName}`, async () => {
            const {serviceProvider, eventBooking} = await createReferences();

            await assert.rejects(
                prisma.service.create({
                    data: {
                        serviceProviderId: serviceProvider.id,
                        eventBookingId: eventBooking.id,
                        [fieldName]: new Prisma.Decimal("-1.00"),
                    },
                }),
                isServiceAmountCheckConstraintError,
            );
        });
    }

    it("rejects duplicate service provider and event booking pairs", async () => {
        const {serviceProvider, eventBooking} = await createReferences();

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
