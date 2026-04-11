import { createCrudRouter } from "../lib/crud-router.js";
import {
  listDefaultBookingConfigurations,
  updateDefaultBookingConfiguration,
} from "./default-booking-configuration.service.js";
import {
  parseDefaultBookingConfigurationId,
  parseListDefaultBookingConfigurationsInput,
  parseUpdateDefaultBookingConfigurationInput,
} from "./default-booking-configuration.validation.js";

export const defaultBookingConfigurationRouter = createCrudRouter({
  list: {
    responseKey: "defaultBookingConfigurations",
    parseInput: parseListDefaultBookingConfigurationsInput,
    handler: listDefaultBookingConfigurations,
  },
  update: {
    responseKey: "defaultBookingConfiguration",
    parseId: parseDefaultBookingConfigurationId,
    parseInput: parseUpdateDefaultBookingConfigurationInput,
    handler: updateDefaultBookingConfiguration,
  },
});
