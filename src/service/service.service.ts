import type {
  ServiceGetPayload,
  ServiceSelect,
} from "../generated/prisma/models/Service.js";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../auth/http-error.js";
import { prisma } from "../lib/prisma.js";

const serviceSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  serviceProviderId: true,
  eventBookingId: true,
  contractedAmount: true,
  commissionAmount: true,
} satisfies ServiceSelect;

type ServiceRecord = ServiceGetPayload<{
  select: typeof serviceSelect;
}>;

export type ServiceResponse = Omit<
  ServiceRecord,
  "contractedAmount" | "commissionAmount"
> & {
  contractedAmount: string | null;
  commissionAmount: string | null;
};

export type ServiceUpdatePayload = {
  contractedAmount?: Prisma.Decimal | null;
  commissionAmount?: Prisma.Decimal | null;
};

const serviceNotFoundError = () => new HttpError(404, "Service not found.");

const serializeDecimal = (value: Prisma.Decimal | null): string | null => {
  return value === null ? null : value.toFixed(2);
};

const serializeService = (service: ServiceRecord): ServiceResponse => {
  return {
    ...service,
    contractedAmount: serializeDecimal(service.contractedAmount),
    commissionAmount: serializeDecimal(service.commissionAmount),
  };
};

const validateServiceAmounts = (
  contractedAmount: Prisma.Decimal | null,
  commissionAmount: Prisma.Decimal | null,
): void => {
  if (contractedAmount !== null && contractedAmount.lessThan(0)) {
    throw new HttpError(400, "contractedAmount must be greater than or equal to 0.");
  }

  if (commissionAmount !== null && commissionAmount.lessThan(0)) {
    throw new HttpError(400, "commissionAmount must be greater than or equal to 0.");
  }

  if (commissionAmount !== null && contractedAmount === null) {
    throw new HttpError(
      400,
      "contractedAmount is required when commissionAmount is provided.",
    );
  }

  if (
    contractedAmount !== null &&
    commissionAmount !== null &&
    commissionAmount.greaterThanOrEqualTo(contractedAmount)
  ) {
    throw new HttpError(
      400,
      "commissionAmount must be less than contractedAmount.",
    );
  }
};

export const getServiceById = async (id: string): Promise<ServiceResponse> => {
  const service = await prisma.service.findUnique({
    where: {
      id,
    },
    select: serviceSelect,
  });

  if (service === null) {
    throw serviceNotFoundError();
  }

  return serializeService(service);
};

export const updateService = async (
  id: string,
  data: ServiceUpdatePayload,
): Promise<ServiceResponse> => {
  const existingService = await prisma.service.findUnique({
    where: {
      id,
    },
    select: serviceSelect,
  });

  if (existingService === null) {
    throw serviceNotFoundError();
  }

  const contractedAmount = data.contractedAmount === undefined
    ? existingService.contractedAmount
    : data.contractedAmount;
  const commissionAmount = data.commissionAmount === undefined
    ? existingService.commissionAmount
    : data.commissionAmount;

  validateServiceAmounts(contractedAmount, commissionAmount);

  try {
    const service = await prisma.service.update({
      where: {
        id,
      },
      data,
      select: serviceSelect,
    });

    return serializeService(service);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw serviceNotFoundError();
    }

    throw error;
  }
};
