// Express app. Vercel uses the default export; src/server.ts listens locally.
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { getConfig } from "./config.js";
import { checkRouter } from "./routes/check.js";
import { healthRouter } from "./routes/health.js";

const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without an Origin header (curl, server-to-server) are not subject to CORS.
      callback(null, !origin || getConfig().corsOrigins.includes(origin));
    },
  }),
);
app.use(express.json({ limit: "16kb" }));

app.get("/", (_req, res) => {
  res.json({ service: "Clearance Gateway API", health: "/health" });
});
app.use(healthRouter);
app.use(checkRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Errors never echo the request body (SPEC §10, §15).
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  const error = status === 413 ? "body_too_large" : status === 400 ? "invalid_request" : "internal_error";
  if (status >= 500) console.error("Unhandled error:", err?.name ?? "Error");
  res.status(status).json({ error });
};
app.use(errorHandler);

export default app;
