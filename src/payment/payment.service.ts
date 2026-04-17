import type {
  PaymentGetPayload,
  PaymentSelect,
} from "../generated/prisma/models/Payment.js";
import { Prisma } from "../generated/prisma/client.js";
import type { PaymentMode } from "../generated/prisma/enums.js";
import { HttpError } from "../auth/http-error.js";
import {
  buildCreatedAtDescCursorOrderBy,
  buildCreatedAtDescCursorWhere,
  buildCursorPage,
  getCreatedAtCursor,
  type CreatedAtCursor,
  type CursorListResult,
  type CursorPageParams,
} from "../lib/listing.js";
import { prisma } from "../lib/prisma.js";

const paymentSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  mode: true,
  amount: true,
  date: true,
  serviceId: true,
  paymentProofFileId: true,
} satisfies PaymentSelect;

type PaymentRecord = PaymentGetPayload<{
  select: typeof paymentSelect;
}>;

export type PaymentPayload = {
  mode: PaymentMode;
  amount: Prisma.Decimal;
  date: Date;
  serviceId: string;
  paymentProofFileId: string | null;
};

export type PaymentResponse = Omit<PaymentRecord, "amount" | "date"> & {
  amount: string;
  date: string;
};

export type PaymentListCursor = CreatedAtCursor;
export type ListPaymentsInput = CursorPageParams<PaymentListCursor> & {
  serviceId: string | null;
};
export type ListPaymentsResponse = CursorListResult<PaymentResponse>;

const paymentNotFoundError = () => new HttpError(404, "Payment not found.");
const serviceNotFoundError = () => new HttpError(404, "Service not found.");
const fileNotFoundError = () => new HttpError(404, "File not found.");

const isForeignKeyError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

const serializeAmount = (value: Prisma.Decimal): string => {
  return value.toFixed(2);
};

const serializeDate = (value: Date): string => {
  return value.toISOString().slice(0, 10);
};

const serializePayment = (payment: PaymentRecord): PaymentResponse => {
  return {
    ...payment,
    amount: serializeAmount(payment.amount),
    date: serializeDate(payment.date),
  };
};

const assertServiceExists = async (serviceId: string): Promise<void> => {
  const service = await prisma.service.findUnique({
    where: {
      id: serviceId,
    },
    select: {
      id: true,
    },
  });

  if (service === null) {
    throw serviceNotFoundError();
  }
};

const assertFileExists = async (fileId: string | null): Promise<void> => {
  if (fileId === null) {
    return;
  }

  const file = await prisma.file.findUnique({
    where: {
      id: fileId,
    },
    select: {
      id: true,
    },
  });

  if (file === null) {
    throw fileNotFoundError();
  }
};

export const createPayment = async (data: PaymentPayload): Promise<PaymentResponse> => {
  await assertServiceExists(data.serviceId);
  await assertFileExists(data.paymentProofFileId);

  try {
    const payment = await prisma.payment.create({
      data,
      select: paymentSelect,
    });

    return serializePayment(payment);
  } catch (error) {
    if (isForeignKeyError(error)) {
      if (data.serviceId) {
        throw serviceNotFoundError();
      }

      if (data.paymentProofFileId !== null) {
        throw fileNotFoundError();
      }
    }

    throw error;
  }
};

export const getPaymentById = async (id: string): Promise<PaymentResponse> => {
  const payment = await prisma.payment.findUnique({
    where: {
      id,
    },
    select: paymentSelect,
  });

  if (payment === null) {
    throw paymentNotFoundError();
  }

  return serializePayment(payment);
};

export const updatePayment = async (
  id: string,
  data: PaymentPayload,
): Promise<PaymentResponse> => {
  await assertServiceExists(data.serviceId);
  await assertFileExists(data.paymentProofFileId);

  try {
    const payment = await prisma.payment.update({
      where: {
        id,
      },
      data,
      select: paymentSelect,
    });

    return serializePayment(payment);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw paymentNotFoundError();
    }

    if (isForeignKeyError(error)) {
      throw serviceNotFoundError();
    }

    throw error;
  }
};

export const listPayments = async ({
  limit,
  cursor,
  serviceId,
}: ListPaymentsInput): Promise<ListPaymentsResponse> => {
  const whereConditions: Prisma.PaymentWhereInput[] = [];
  const cursorWhere = buildCreatedAtDescCursorWhere(cursor);

  if (cursorWhere !== undefined) {
    whereConditions.push(cursorWhere);
  }

  if (serviceId !== null) {
    whereConditions.push({
      serviceId,
    });
  }

  const payments = await prisma.payment.findMany({
    where:
      whereConditions.length === 0
        ? undefined
        : whereConditions.length === 1
          ? whereConditions[0]
          : {
              AND: whereConditions,
            },
    orderBy: buildCreatedAtDescCursorOrderBy(),
    take: limit + 1,
    select: paymentSelect,
  });

  return buildCursorPage({
    items: payments.map(serializePayment),
    limit,
    getCursor: getCreatedAtCursor,
  });
};
