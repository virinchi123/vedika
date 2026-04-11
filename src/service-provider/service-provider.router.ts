import { createCrudRouter } from "../lib/crud-router.js";
import {
  createServiceProvider,
  deleteServiceProvider,
  listServiceProviders,
  updateServiceProvider,
} from "./service-provider.service.js";
import {
  parseCreateServiceProviderInput,
  parseListServiceProvidersInput,
  parseServiceProviderId,
  parseUpdateServiceProviderInput,
} from "./service-provider.validation.js";

export const serviceProviderRouter = createCrudRouter({
  list: {
    responseKey: "serviceProviders",
    parseInput: parseListServiceProvidersInput,
    handler: listServiceProviders,
  },
  create: {
    responseKey: "serviceProvider",
    parseInput: parseCreateServiceProviderInput,
    handler: createServiceProvider,
  },
  update: {
    responseKey: "serviceProvider",
    parseId: parseServiceProviderId,
    parseInput: parseUpdateServiceProviderInput,
    handler: updateServiceProvider,
  },
  delete: {
    parseId: parseServiceProviderId,
    handler: deleteServiceProvider,
  },
});
