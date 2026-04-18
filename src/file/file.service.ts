import { HttpError } from "../auth/http-error.js";
import { prisma } from "../lib/prisma.js";
import { findUniqueConstraintMessage } from "../lib/prisma-errors.js";

const fileConflictMessages = {
  gcsPath: "A file with that gcsPath already exists.",
} as const;

const eventBookingNotFoundError = () => new HttpError(404, "Event booking not found.");
const fileConflictError = () => new HttpError(409, "A file with that gcsPath already exists.");

export type CreateFileInput = {
  gcsPath: string;
  extension: string;
  originalName: string | null;
  eventBookingId: string;
};

export type FileResponse = {
  id: string;
  gcsPath: string;
  extension: string;
  originalName: string | null;
  eventBookingId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const hasEventBooking = async (eventBookingId: string): Promise<boolean> => {
  const eventBooking = await prisma.eventBooking.findUnique({
    where: {
      id: eventBookingId,
    },
    select: {
      id: true,
    },
  });

  return eventBooking !== null;
};

const assertEventBookingExists = async (eventBookingId: string): Promise<void> => {
  if (!(await hasEventBooking(eventBookingId))) {
    throw eventBookingNotFoundError();
  }
};

const hasFileWithGcsPath = async (gcsPath: string): Promise<boolean> => {
  const file = await prisma.file.findUnique({
    where: {
      gcsPath,
    },
    select: {
      id: true,
    },
  });

  return file !== null;
};

const assertGcsPathAvailable = async (gcsPath: string): Promise<void> => {
  if (await hasFileWithGcsPath(gcsPath)) {
    throw fileConflictError();
  }
};

export const createFile = async (data: CreateFileInput): Promise<FileResponse> => {
  await assertEventBookingExists(data.eventBookingId);
  await assertGcsPathAvailable(data.gcsPath);

  const id = crypto.randomUUID();
  const createdAt = new Date();

  try {
    await prisma.$executeRaw`
      INSERT INTO "File" (
        "id",
        "gcsPath",
        "extension",
        "originalName",
        "eventBookingId",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${data.gcsPath},
        ${data.extension},
        ${data.originalName},
        ${data.eventBookingId},
        ${createdAt},
        ${createdAt}
      )
    `;
  } catch (error) {
    const conflictMessage = findUniqueConstraintMessage(error, fileConflictMessages);

    if (conflictMessage !== null || (await hasFileWithGcsPath(data.gcsPath))) {
      throw fileConflictError();
    }

    if (!(await hasEventBooking(data.eventBookingId))) {
      throw eventBookingNotFoundError();
    }

    throw error;
  }

  return {
    id,
    gcsPath: data.gcsPath,
    extension: data.extension,
    originalName: data.originalName,
    eventBookingId: data.eventBookingId,
    createdAt,
    updatedAt: createdAt,
  };
};
