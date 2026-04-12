import express from "express";

import { authRouter } from "./auth/auth.router.js";
import { bookingStatusRouter } from "./booking-status/booking-status.router.js";
import { customerInteractionRouter } from "./customer-interaction/customer-interaction.router.js";
import { defaultBookingConfigurationRouter } from "./default-booking-configuration/default-booking-configuration.router.js";
import { eventBookingRouter } from "./event-booking/event-booking.router.js";
import { eventStatusRouter } from "./event-status/event-status.router.js";
import { eventTypeRouter } from "./event-type/event-type.router.js";
import { HttpError, isHttpError } from "./auth/http-error.js";
import { serviceProviderRouter } from "./service-provider/service-provider.router.js";

export const app = express();

app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/auth", authRouter);
app.use("/event-bookings", eventBookingRouter);
app.use("/booking-statuses", bookingStatusRouter);
app.use("/customer-interactions", customerInteractionRouter);
app.use("/default-booking-configurations", defaultBookingConfigurationRouter);
app.use("/event-statuses", eventStatusRouter);
app.use("/event-types", eventTypeRouter);
app.use("/service-providers", serviceProviderRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (isHttpError(error)) {
    response.status(error.statusCode).json({
      error: error.message,
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({
      error: "Request body must be valid JSON.",
    });
    return;
  }

  console.error(error);

  response.status(500).json({
    error: "Internal server error.",
  });
});
