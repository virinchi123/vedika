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
  customerPaidAmount: true,
  grossCommission: true,
  deduction: true,
  commissionPaidAmount: true,
} satisfies ServiceSelect;

type ServiceRecord = ServiceGetPayload<{
  select: typeof serviceSelect;
}>;

export type ServiceResponse = Omit<
  ServiceRecord,
  | "contractedAmount"
  | "customerPaidAmount"
  | "grossCommission"
  | "deduction"
  | "commissionPaidAmount"
> & {
  contractedAmount: string | null;
  customerPaidAmount: string | null;
  grossCommission: string | null;
  deduction: string | null;
  commissionPaidAmount: string | null;
};

export type ServiceUpdatePayload = {
  contractedAmount?: Prisma.Decimal | null;
  customerPaidAmount?: Prisma.Decimal | null;
  grossCommission?: Prisma.Decimal | null;
  deduction?: Prisma.Decimal | null;
  commissionPaidAmount?: Prisma.Decimal | null;
};

type ServiceAmountKey = keyof ServiceUpdatePayload;

const serviceNotFoundError = () => new HttpError(404, "Service not found.");

const serializeDecimal = (value: Prisma.Decimal | null): string | null => {
  return value === null ? null : value.toFixed(2);
};

const serializeService = (service: ServiceRecord): ServiceResponse => {
  return {
    ...service,
    contractedAmount: serializeDecimal(service.contractedAmount),
    customerPaidAmount: serializeDecimal(service.customerPaidAmount),
    grossCommission: serializeDecimal(service.grossCommission),
    deduction: serializeDecimal(service.deduction),
    commissionPaidAmount: serializeDecimal(service.commissionPaidAmount),
  };
};

const validateServiceAmounts = (
  amounts: Record<ServiceAmountKey, Prisma.Decimal | null>,
): void => {
  for (const [fieldName, value] of Object.entries(amounts) as Array<
    [ServiceAmountKey, Prisma.Decimal | null]
  >) {
    if (value !== null && value.lessThan(0)) {
      throw new HttpError(400, `${fieldName} must be greater than or equal to 0.`);
    }
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
  const customerPaidAmount = data.customerPaidAmount === undefined
    ? existingService.customerPaidAmount
    : data.customerPaidAmount;
  const grossCommission = data.grossCommission === undefined
    ? existingService.grossCommission
    : data.grossCommission;
  const deduction = data.deduction === undefined
    ? existingService.deduction
    : data.deduction;
  const commissionPaidAmount = data.commissionPaidAmount === undefined
    ? existingService.commissionPaidAmount
    : data.commissionPaidAmount;

  validateServiceAmounts({
    contractedAmount,
    customerPaidAmount,
    grossCommission,
    deduction,
    commissionPaidAmount,
  });

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
