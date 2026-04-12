import { createCrudRouter } from "../lib/crud-router.js";
import { asyncHandler } from "../lib/async-handler.js";
import {
  createCustomerInteraction,
  deleteCustomerInteraction,
  getCustomerInteractionById,
  listCustomerInteractions,
  updateCustomerInteractionIgnored,
  updateCustomerInteraction,
} from "./customer-interaction.service.js";
import {
  parseCreateCustomerInteractionInput,
  parseCustomerInteractionId,
  parseIgnoreCustomerInteractionInput,
  parseListCustomerInteractionsInput,
  parseUpdateCustomerInteractionInput,
} from "./customer-interaction.validation.js";

export const customerInteractionRouter = createCrudRouter({
  list: {
    responseKey: "customerInteractions",
    parseInput: parseListCustomerInteractionsInput,
    handler: listCustomerInteractions,
  },
  getById: {
    responseKey: "customerInteraction",
    parseId: parseCustomerInteractionId,
    handler: getCustomerInteractionById,
  },
  create: {
    responseKey: "customerInteraction",
    parseInput: parseCreateCustomerInteractionInput,
    handler: createCustomerInteraction,
  },
  update: {
    responseKey: "customerInteraction",
    parseId: parseCustomerInteractionId,
    parseInput: parseUpdateCustomerInteractionInput,
    handler: updateCustomerInteraction,
  },
  delete: {
    parseId: parseCustomerInteractionId,
    handler: deleteCustomerInteraction,
  },
});

customerInteractionRouter.patch(
  "/:id/ignore",
  asyncHandler(async (request, response) => {
    const customerInteraction = await updateCustomerInteractionIgnored(
      parseCustomerInteractionId(request.params.id),
      parseIgnoreCustomerInteractionInput(request.body),
    );

    response.status(200).json({
      customerInteraction,
    });
  }),
);
