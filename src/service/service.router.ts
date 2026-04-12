import { createCrudRouter } from "../lib/crud-router.js";
import { asyncHandler } from "../lib/async-handler.js";
import { getServiceById, updateService } from "./service.service.js";
import { parseServiceId, parseUpdateServiceInput } from "./service.validation.js";

export const serviceRouter = createCrudRouter({
  getById: {
    responseKey: "service",
    parseId: parseServiceId,
    handler: getServiceById,
  },
});

serviceRouter.patch(
  "/:id",
  asyncHandler(async (request, response) => {
    const service = await updateService(
      parseServiceId(request.params.id),
      parseUpdateServiceInput(request.body),
    );

    response.status(200).json({
      service,
    });
  }),
);
