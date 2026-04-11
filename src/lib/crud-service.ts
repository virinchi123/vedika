import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../auth/http-error.js";
import {
  buildCreatedAtDescCursorOrderBy,
  buildCreatedAtDescCursorWhere,
  buildCursorPage,
  getCreatedAtCursor,
  type CreatedAtCursor,
  type CursorListResult,
  type CursorPageParams,
} from "./listing.js";
import { findUniqueConstraintMessage } from "./prisma-errors.js";

type UniqueConstraintMessages = Readonly<Record<string, string>>;

type CrudModelDelegate<TPayload, TSelect, TResponse> = {
  create(args: { data: TPayload; select: TSelect }): Promise<TResponse>;
  findMany(args: unknown): Promise<TResponse[]>;
  update(args: { where: { id: string }; data: TPayload; select: TSelect }): Promise<TResponse>;
  delete(args: { where: { id: string } }): Promise<unknown>;
};

type CreateCreatedAtCrudServiceOptions<TPayload, TSelect, TResponse> = {
  delegate: CrudModelDelegate<TPayload, TSelect, TResponse>;
  select: TSelect;
  notFoundMessage: string;
  uniqueConstraintMessages?: UniqueConstraintMessages;
};

const isMissingRecordError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
};

const toConflictError = (error: unknown, messages: UniqueConstraintMessages): HttpError | null => {
  const message = findUniqueConstraintMessage(error, messages);
  return message === null ? null : new HttpError(409, message);
};

export const createCreatedAtCrudService = <TPayload, TSelect, TResponse extends CreatedAtCursor>({
  delegate,
  select,
  notFoundMessage,
  uniqueConstraintMessages = {},
}: CreateCreatedAtCrudServiceOptions<TPayload, TSelect, TResponse>) => {
  return {
    create: async (data: TPayload): Promise<TResponse> => {
      try {
        return await delegate.create({
          data,
          select,
        });
      } catch (error) {
        throw toConflictError(error, uniqueConstraintMessages) ?? error;
      }
    },

    list: async ({
      limit,
      cursor,
    }: CursorPageParams<CreatedAtCursor>): Promise<CursorListResult<TResponse>> => {
      const items = await delegate.findMany({
        where: buildCreatedAtDescCursorWhere(cursor),
        orderBy: buildCreatedAtDescCursorOrderBy(),
        take: limit + 1,
        select,
      });

      return buildCursorPage({
        items,
        limit,
        getCursor: getCreatedAtCursor,
      });
    },

    update: async (id: string, data: TPayload): Promise<TResponse> => {
      try {
        return await delegate.update({
          where: {
            id,
          },
          data,
          select,
        });
      } catch (error) {
        if (isMissingRecordError(error)) {
          throw new HttpError(404, notFoundMessage);
        }

        throw toConflictError(error, uniqueConstraintMessages) ?? error;
      }
    },

    remove: async (id: string): Promise<void> => {
      try {
        await delegate.delete({
          where: {
            id,
          },
        });
      } catch (error) {
        if (isMissingRecordError(error)) {
          throw new HttpError(404, notFoundMessage);
        }

        throw error;
      }
    },
  };
};
