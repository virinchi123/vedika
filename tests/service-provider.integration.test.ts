import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prisma } from "../src/lib/prisma.js";
import {
  api,
  registerAndAuthenticate,
  setupIntegrationTestLifecycle,
} from "./integration-test-utils.js";

const createServiceProviderRecord = async (name: string, createdAt: string) => {
  return prisma.serviceProvider.create({
    data: {
      name,
      createdAt: new Date(createdAt),
    },
  });
};

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

  return {
    bookingStatus,
    eventStatus,
    eventType,
  };
};

setupIntegrationTestLifecycle();

describe("service provider routes", () => {
  it("lists service providers with cursor pagination", async () => {
    const accessToken = await registerAndAuthenticate();
    await createServiceProviderRecord("Oldest Services", "2026-04-10T10:00:00.000Z");
    await createServiceProviderRecord("Middle Services", "2026-04-11T10:00:00.000Z");
    const newestServiceProvider = await createServiceProviderRecord("Newest Services", "2026-04-12T10:00:00.000Z");

    const response = await api
      .get("/service-providers")
      .query({
        limit: "2",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.serviceProviders.map((serviceProvider: { name: string }) => serviceProvider.name),
      ["Newest Services", "Middle Services"],
    );
    assert.equal(response.body.pageInfo.limit, 2);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
    assert.equal(response.body.serviceProviders[0].id, newestServiceProvider.id);
  });

  it("lists the next page when a cursor is provided", async () => {
    const accessToken = await registerAndAuthenticate();
    await createServiceProviderRecord("Oldest Services", "2026-04-10T10:00:00.000Z");
    await createServiceProviderRecord("Middle Services", "2026-04-11T10:00:00.000Z");
    await createServiceProviderRecord("Newest Services", "2026-04-12T10:00:00.000Z");

    const firstPageResponse = await api
      .get("/service-providers")
      .query({
        limit: "1",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(firstPageResponse.status, 200);
    assert.ok(typeof firstPageResponse.body.pageInfo.nextCursor === "string");

    const response = await api
      .get("/service-providers")
      .query({
        limit: "1",
        cursor: firstPageResponse.body.pageInfo.nextCursor,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.serviceProviders.map((serviceProvider: { name: string }) => serviceProvider.name),
      ["Middle Services"],
    );
    assert.equal(response.body.pageInfo.limit, 1);
    assert.equal(response.body.pageInfo.hasNextPage, true);
    assert.ok(typeof response.body.pageInfo.nextCursor === "string");
  });

  it("rejects unauthenticated list requests", async () => {
    const response = await api.get("/service-providers");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("rejects invalid pagination params", async () => {
    const accessToken = await registerAndAuthenticate();

    const invalidLimitResponse = await api
      .get("/service-providers")
      .query({
        limit: "0",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidLimitResponse.status, 400);
    assert.equal(invalidLimitResponse.body.error, "limit must be a positive integer.");

    const invalidCursorResponse = await api
      .get("/service-providers")
      .query({
        cursor: "not-a-valid-cursor",
      })
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(invalidCursorResponse.status, 400);
    assert.equal(invalidCursorResponse.body.error, "cursor must be a valid cursor.");
  });

  it("creates a service provider for an authenticated request", async () => {
    const accessToken = await registerAndAuthenticate();

    const response = await api
      .post("/service-providers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Acme Services",
        phoneNumber: " +91 98765 43210 ",
        email: " CONTACT@ACME.COM ",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.serviceProvider.name, "Acme Services");
    assert.equal(response.body.serviceProvider.phoneNumber, "+91 98765 43210");
    assert.equal(response.body.serviceProvider.email, "contact@acme.com");

    const serviceProvider = await prisma.serviceProvider.findUnique({
      where: {
        id: response.body.serviceProvider.id,
      },
    });

    assert.ok(serviceProvider);
    assert.equal(serviceProvider.name, "Acme Services");
  });

  it("rejects unauthenticated create requests", async () => {
    const response = await api.post("/service-providers").send({
      name: "Acme Services",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid or missing access token.");
  });

  it("updates a service provider with a full replacement payload", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingServiceProvider = await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
        phoneNumber: "1111111111",
        email: "old@example.com",
      },
    });

    const response = await api
      .put(`/service-providers/${existingServiceProvider.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Updated Services",
        phoneNumber: "",
        email: "new@example.com",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.serviceProvider.name, "Updated Services");
    assert.equal(response.body.serviceProvider.phoneNumber, null);
    assert.equal(response.body.serviceProvider.email, "new@example.com");

    const updatedServiceProvider = await prisma.serviceProvider.findUnique({
      where: {
        id: existingServiceProvider.id,
      },
    });

    assert.ok(updatedServiceProvider);
    assert.equal(updatedServiceProvider.name, "Updated Services");
    assert.equal(updatedServiceProvider.phoneNumber, null);
    assert.equal(updatedServiceProvider.email, "new@example.com");
  });

  it("rejects duplicate names", async () => {
    const accessToken = await registerAndAuthenticate();
    await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
      },
    });

    const response = await api
      .post("/service-providers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Acme Services",
        email: "different@example.com",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "A service provider with that name already exists.");
  });

  it("rejects duplicate emails", async () => {
    const accessToken = await registerAndAuthenticate();
    await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
        email: "contact@example.com",
      },
    });

    const response = await api
      .post("/service-providers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Updated Services",
        email: "contact@example.com",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "A service provider with that email already exists.");
  });

  it("requires name on full replacement updates", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingServiceProvider = await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
      },
    });

    const response = await api
      .put(`/service-providers/${existingServiceProvider.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: "new@example.com",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "name must be a string.");
  });

  it("deletes a service provider by id", async () => {
    const accessToken = await registerAndAuthenticate();
    const existingServiceProvider = await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
      },
    });

    const response = await api
      .delete(`/service-providers/${existingServiceProvider.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 204);

    const serviceProvider = await prisma.serviceProvider.findUnique({
      where: {
        id: existingServiceProvider.id,
      },
    });

    assert.equal(serviceProvider, null);
  });

  it("rejects deleting a service provider when services reference it", async () => {
    const accessToken = await registerAndAuthenticate();
    const references = await createReferences();
    const existingServiceProvider = await prisma.serviceProvider.create({
      data: {
        name: "Acme Services",
      },
    });
    const eventBooking = await prisma.eventBooking.create({
      data: {
        mode: "PHONE_IN",
        bookingStatusId: references.bookingStatus.id,
        eventStatusId: references.eventStatus.id,
        eventTypeId: references.eventType.id,
        bookingStart: new Date("2026-04-20T10:00:00.000Z"),
        bookingEnd: new Date("2026-04-20T12:00:00.000Z"),
        customerName: "Priya Sharma",
        phoneNumber1: "9876543210",
        serviceProviders: {
          connect: [{ id: existingServiceProvider.id }],
        },
      },
    });
    await prisma.service.create({
      data: {
        serviceProviderId: existingServiceProvider.id,
        eventBookingId: eventBooking.id,
      },
    });

    const response = await api
      .delete(`/service-providers/${existingServiceProvider.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(response.status, 409);
    assert.equal(
      response.body.error,
      "Cannot delete service provider while services reference it.",
    );

    const serviceProvider = await prisma.serviceProvider.findUnique({
      where: {
        id: existingServiceProvider.id,
      },
    });

    assert.ok(serviceProvider);
  });
});
