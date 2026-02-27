import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { brandRouter } from "./brand.routes.js";
import { authRouter } from "./auth.routes.js";
import { meRouter } from "./me.routes.js";
import { uploadsRouter } from "./uploads.routes.js";
import { adminRouter } from "./admin.routes.js";
import { stripeRouter } from "./stripe.routes.js";
import { loadUserFromSession } from "./session.js";
import { jobsRouter } from "./jobs.routes.js";
import { runsRouter } from "./runs.routes.js";
import { diffsetsRouter } from "./diffsets.routes.js";
import { exportsRouter } from "./exports.routes.js";
import { hasMagicLinkEmailConfig } from "./auth.service.js";

type HealthConfigStatus = {
  nodeEnv: string;
  hasAppBaseUrl: boolean;
  hasFrontendOrigin: boolean;
  appBaseUrlLooksLocalhost: boolean;
  hasMagicLinkEmailConfig: boolean;
  magicLinkTtlMin: number;
  magicLinkTtlValid: boolean;
  sessionDays: number;
  sessionDaysValid: boolean;
  corsAllowedOriginsCount: number;
};

function warnConfig(message: string) {
  console.warn(`[DD84][config-warning] ${message}`);
}

function getHealthConfigStatus(corsAllowedOriginsCount: number): HealthConfigStatus {
  const isProd = process.env.NODE_ENV === "production";
  const appBaseUrl = process.env.APP_BASE_URL || "";
  const frontendOrigin = process.env.FRONTEND_ORIGIN || "";

  const magicLinkTtlMin = Number(process.env.MAGICLINK_TOKEN_TTL_MIN || 15);
  const sessionDays = Number(process.env.SESSION_DAYS || 14);

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    hasAppBaseUrl: Boolean(appBaseUrl),
    hasFrontendOrigin: Boolean(frontendOrigin),
    appBaseUrlLooksLocalhost: isProd && appBaseUrl.includes("localhost"),
    hasMagicLinkEmailConfig: hasMagicLinkEmailConfig(),
    magicLinkTtlMin,
    magicLinkTtlValid: Number.isFinite(magicLinkTtlMin) && magicLinkTtlMin > 0,
    sessionDays,
    sessionDaysValid: Number.isFinite(sessionDays) && sessionDays > 0,
    corsAllowedOriginsCount
  };
}

function validateStartupAuthConfig(status: HealthConfigStatus) {
  const isProd = status.nodeEnv === "production";
  const debugAuthTokenEnabled = String(process.env.DEV_DEBUG_AUTH_START_TOKEN || "false").toLowerCase() === "true";

  if (!status.hasAppBaseUrl) {
    warnConfig("APP_BASE_URL is not set. Magic links will default to http://localhost:3000.");
  }

  if (isProd && !status.hasFrontendOrigin) {
    warnConfig("FRONTEND_ORIGIN is not set in production. Browser CORS requests may fail.");
  }

  if (status.appBaseUrlLooksLocalhost) {
    warnConfig("APP_BASE_URL points to localhost in production. Magic links may be invalid for users.");
  }

  if (!status.magicLinkTtlValid) {
    warnConfig("MAGICLINK_TOKEN_TTL_MIN must be a positive number.");
  }

  if (!status.sessionDaysValid) {
    warnConfig("SESSION_DAYS must be a positive number.");
  }

  if (isProd && !status.hasMagicLinkEmailConfig) {
    warnConfig("Magic-link email delivery is not configured. Set SMTP_* and MAGICLINK_FROM_EMAIL.");
  }

  if (isProd && debugAuthTokenEnabled) {
    warnConfig("DEV_DEBUG_AUTH_START_TOKEN is enabled in production. Disable it to avoid exposing auth tokens.");
  }
}

const app = express();
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  process.env.APP_BASE_URL,
  "http://localhost:5173",
  "http://localhost:3000"
].filter(Boolean) as string[];
const healthConfigStatus = getHealthConfigStatus(allowedOrigins.length);
validateStartupAuthConfig(healthConfigStatus);

app.use(
  cors({
    origin: (origin, cb) => {
      // allow non-browser clients (no origin) and allow listed origins
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"), false);
    },
    credentials: true
  })
);

app.use("/api/v1/stripe", express.raw({ type: "application/json" }), stripeRouter);

app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());
app.use(loadUserFromSession);
app.use(morgan("tiny"));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/health/details", (_req, res) => {
  res.json({ ok: true, config: healthConfigStatus });
});

app.use("/api/v1/brand", brandRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/me", meRouter);
app.use("/api/v1/uploads", uploadsRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/jobs", jobsRouter);
app.use("/api/v1/runs", runsRouter);
app.use("/api/v1", diffsetsRouter);
app.use("/api/v1", exportsRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => console.log(`Down Dirty 84 API listening on :${port}`));
