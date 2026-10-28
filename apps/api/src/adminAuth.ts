// Demo admin auth: the x-admin-code header must equal DEMO_ADMIN_CODE. A documented limitation,
// not production auth (no SSO, one shared code).
import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { getConfig } from "./config.js";

const digest = (value: string) => createHash("sha256").update(value).digest();

export const requireAdmin: RequestHandler = (req, res, next) => {
  const expected = getConfig().demoAdminCode;
  if (!expected) {
    res.status(503).json({ error: "admin_disabled" });
    return;
  }
  const given = req.header("x-admin-code") ?? "";
  // Compare fixed-length digests so the comparison time doesn't depend on the code.
  if (!timingSafeEqual(digest(given), digest(expected))) {
    res.status(401).json({ error: "admin_code_required" });
    return;
  }
  next();
};
