import { Prisma } from "../generated/prisma/client.js";
import type {
  ServiceProviderGetPayload,
  ServiceProviderSelect,
} from "../generated/prisma/models/ServiceProvider.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../auth/http-error.js";

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

export type ServiceProviderResponse = ServiceProviderGetPayload<{
  select: typeof serviceProviderSelect;
}>;

const hasUniqueConstraintField = (error: Prisma.PrismaClientKnownRequestError, fieldName: string): boolean => {
  const legacyTarget = error.meta?.target;
  if (Array.isArray(legacyTarget) && legacyTarget.includes(fieldName)) {
    return true;
  }

  const adapterConstraintFields =
    typeof error.meta === "object" &&
    error.meta !== null &&
    "driverAdapterError" in error.meta &&
    typeof error.meta.driverAdapterError === "object" &&
    error.meta.driverAdapterError !== null &&
    "cause" in error.meta.driverAdapterError &&
    typeof error.meta.driverAdapterError.cause === "object" &&
    error.meta.driverAdapterError.cause !== null &&
    "constraint" in error.meta.driverAdapterError.cause &&
    typeof error.meta.driverAdapterError.cause.constraint === "object" &&
    error.meta.driverAdapterError.cause.constraint !== null &&
    "fields" in error.meta.driverAdapterError.cause.constraint
      ? error.meta.driverAdapterError.cause.constraint.fields
      : undefined;

  return (
    Array.isArray(adapterConstraintFields) &&
    adapterConstraintFields.some((value) => value === fieldName || value === `"${fieldName}"`)
  );
};

const toServiceProviderConflictError = (error: unknown): HttpError | null => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }

  if (hasUniqueConstraintField(error, "name")) {
    return new HttpError(409, "A service provider with that name already exists.");
  }

  if (hasUniqueConstraintField(error, "email")) {
    return new HttpError(409, "A service provider with that email already exists.");
  }

  return null;
};

const isMissingServiceProviderError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
};

export const createServiceProvider = async (
  data: ServiceProviderPayload,
): Promise<ServiceProviderResponse> => {
  try {
    return await prisma.serviceProvider.create({
      data,
      select: serviceProviderSelect,
    });
  } catch (error) {
    throw toServiceProviderConflictError(error) ?? error;
  }
};

export const updateServiceProvider = async (
  id: string,
  data: ServiceProviderPayload,
): Promise<ServiceProviderResponse> => {
  try {
    return await prisma.serviceProvider.update({
      where: {
        id,
      },
      data,
      select: serviceProviderSelect,
    });
  } catch (error) {
    if (isMissingServiceProviderError(error)) {
      throw new HttpError(404, "Service provider not found.");
    }

    throw toServiceProviderConflictError(error) ?? error;
  }
};

export const deleteServiceProvider = async (id: string): Promise<void> => {
  try {
    await prisma.serviceProvider.delete({
      where: {
        id,
      },
    });
  } catch (error) {
    if (isMissingServiceProviderError(error)) {
      throw new HttpError(404, "Service provider not found.");
    }

    throw error;
  }
};
