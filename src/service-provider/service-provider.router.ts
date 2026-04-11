import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import {
  createServiceProvider,
  deleteServiceProvider,
  updateServiceProvider,
} from "./service-provider.service.js";
import {
  parseCreateServiceProviderInput,
  parseServiceProviderId,
  parseUpdateServiceProviderInput,
} from "./service-provider.validation.js";

export const serviceProviderRouter = Router();

serviceProviderRouter.use(requireAuth);

serviceProviderRouter.post(
  "/",
  asyncHandler(async (request, response) => {
    const serviceProvider = await createServiceProvider(parseCreateServiceProviderInput(request.body));

    response.status(201).json({
      serviceProvider,
    });
  }),
);

serviceProviderRouter.put(
  "/:id",
  asyncHandler(async (request, response) => {
    const serviceProvider = await updateServiceProvider(
      parseServiceProviderId(request.params.id),
      parseUpdateServiceProviderInput(request.body),
    );

    response.status(200).json({
      serviceProvider,
    });
  }),
);

serviceProviderRouter.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    await deleteServiceProvider(parseServiceProviderId(request.params.id));

    response.status(204).send();
  }),
);
