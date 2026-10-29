// Express app. Vercel uses the default export; src/server.ts listens locally.
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { getConfig } from "./config.js";
import { adminRouter } from "./routes/admin.js";
import { chatRouter } from "./routes/chat.js";
import { checkRouter } from "./routes/check.js";
import { healthRouter } from "./routes/health.js";
import { policyRouter } from "./routes/policy.js";
import { providersRouter } from "./routes/providers.js";
import { statsRouter } from "./routes/stats.js";

const app = express();
app.disable("x-powered-by");

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without an Origin header (curl, server-to-server) are not subject to CORS.
      // Chrome extension origins are allowed for Lens: an unpacked extension's id depends on its
      // install path, and the endpoints it uses (/api/check) are public anyway.
      callback(null, !origin || getConfig().corsOrigins.includes(origin) || EXTENSION_ORIGIN.test(origin));
    },
  }),
);
app.use(express.json({ limit: "16kb" }));

// Responses may contain the redacted text a user is about to send: never cache them, never frame.
app.use((_req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });
  next();
});

app.get("/", (_req, res) => {
  res.json({ service: "Clearance Gateway API", health: "/health" });
});
app.use(healthRouter);
app.use(checkRouter);
app.use(chatRouter);
app.use(providersRouter);
app.use(policyRouter);
app.use(statsRouter);
app.use(adminRouter);

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
