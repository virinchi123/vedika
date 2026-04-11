import express from "express";

import { authRouter } from "./auth/auth.router.js";
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
