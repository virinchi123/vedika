import type {
  ServiceProviderGetPayload,
  ServiceProviderSelect,
} from "../generated/prisma/models/ServiceProvider.js";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../auth/http-error.js";
import {
  type CreatedAtCursor,
  type CursorListResult,
  type CursorPageParams,
} from "../lib/listing.js";
import { createCreatedAtCrudService } from "../lib/crud-service.js";
import { prisma } from "../lib/prisma.js";

const serviceProviderSelect = {
  id: true,
  name: true,
  phoneNumber: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} satisfies ServiceProviderSelect;

export type ServiceProviderPayload = {
  name: string;
  phoneNumber: string | null;
  email: string | null;
};

export type ServiceProviderListCursor = CreatedAtCursor;

export type ServiceProviderResponse = ServiceProviderGetPayload<{
  select: typeof serviceProviderSelect;
}>;

export type ListServiceProvidersInput = CursorPageParams<ServiceProviderListCursor>;
export type ListServiceProvidersResponse = CursorListResult<ServiceProviderResponse>;

const serviceProviderConflictMessages = {
  email: "A service provider with that email already exists.",
  name: "A service provider with that name already exists.",
} as const;

const serviceProviderCrud = createCreatedAtCrudService<
  ServiceProviderPayload,
  typeof serviceProviderSelect,
  ServiceProviderResponse
>({
  delegate: prisma.serviceProvider,
  select: serviceProviderSelect,
  notFoundMessage: "Service provider not found.",
  uniqueConstraintMessages: serviceProviderConflictMessages,
});

export const createServiceProvider = serviceProviderCrud.create;
export const listServiceProviders: (input: ListServiceProvidersInput) => Promise<ListServiceProvidersResponse> =
  serviceProviderCrud.list;
export const updateServiceProvider = serviceProviderCrud.update;
export const deleteServiceProvider = async (id: string): Promise<void> => {
  try {
    await serviceProviderCrud.remove(id);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new HttpError(
        409,
        "Cannot delete service provider while services reference it.",
      );
    }

    throw error;
  }
};
