import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware.js";
import { asyncHandler } from "./async-handler.js";
import type { CursorListResult } from "./listing.js";

type CrudListOperation<TEntity, TListInput> = {
  responseKey: string;
  parseInput: (value: unknown) => TListInput;
  handler: (input: TListInput) => Promise<CursorListResult<TEntity>>;
};

type CrudCreateOperation<TEntity, TCreateInput> = {
  responseKey: string;
  parseInput: (value: unknown) => TCreateInput;
  handler: (input: TCreateInput) => Promise<TEntity>;
};

type CrudGetOperation<TEntity> = {
  responseKey: string;
  parseId: (value: unknown) => string;
  handler: (id: string) => Promise<TEntity>;
};

type CrudUpdateOperation<TEntity, TUpdateInput> = {
  responseKey: string;
  parseId: (value: unknown) => string;
  parseInput: (value: unknown) => TUpdateInput;
  handler: (id: string, input: TUpdateInput) => Promise<TEntity>;
};

type CrudDeleteOperation = {
  parseId: (value: unknown) => string;
  handler: (id: string) => Promise<void>;
};

type CreateCrudRouterOptions<TEntity, TCreateInput, TUpdateInput, TListInput> = {
  requireAuthentication?: boolean;
  list?: CrudListOperation<TEntity, TListInput>;
  getById?: CrudGetOperation<TEntity>;
  create?: CrudCreateOperation<TEntity, TCreateInput>;
  update?: CrudUpdateOperation<TEntity, TUpdateInput>;
  delete?: CrudDeleteOperation;
};

export const createCrudRouter = <TEntity, TCreateInput, TUpdateInput, TListInput>({
  requireAuthentication = true,
  list,
  getById,
  create,
  update,
  delete: deleteOperation,
}: CreateCrudRouterOptions<TEntity, TCreateInput, TUpdateInput, TListInput>) => {
  const router = Router();

  if (requireAuthentication) {
    router.use(requireAuth);
  }

  if (list) {
    router.get(
      "/",
      asyncHandler(async (request, response) => {
        const result = await list.handler(list.parseInput(request.query));

        response.status(200).json({
          [list.responseKey]: result.items,
          pageInfo: result.pageInfo,
        });
      }),
    );
  }

  if (getById) {
    router.get(
      "/:id",
      asyncHandler(async (request, response) => {
        const record = await getById.handler(getById.parseId(request.params.id));

        response.status(200).json({
          [getById.responseKey]: record,
        });
      }),
    );
  }

  if (create) {
    router.post(
      "/",
      asyncHandler(async (request, response) => {
        const record = await create.handler(create.parseInput(request.body));

        response.status(201).json({
          [create.responseKey]: record,
        });
      }),
    );
  }

  if (update) {
    router.put(
      "/:id",
      asyncHandler(async (request, response) => {
        const record = await update.handler(
          update.parseId(request.params.id),
          update.parseInput(request.body),
        );

        response.status(200).json({
          [update.responseKey]: record,
        });
      }),
    );
  }

  if (deleteOperation) {
    router.delete(
      "/:id",
      asyncHandler(async (request, response) => {
        await deleteOperation.handler(deleteOperation.parseId(request.params.id));

        response.status(204).send();
      }),
    );
  }

  return router;
};
