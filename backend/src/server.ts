import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { brandRouter } from "./routes/brand.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { meRouter } from "./routes/me.routes.js";
import { uploadsRouter } from "./routes/uploads.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { stripeRouter } from "./routes/stripe.routes.js";
import { loadUserFromSession } from "./middleware/session.js";
import { jobsRouter } from "./routes/jobs.routes.js";
import { runsRouter } from "./routes/runs.routes.js";
import { diffsetsRouter } from "./routes/diffsets.routes.js";
import { exportsRouter } from "./routes/exports.routes.js";

const app = express();
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  process.env.APP_BASE_URL,
  "http://localhost:5173",
  "http://localhost:3000"
].filter(Boolean) as string[];

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

app.use("/api/v1/brand", brandRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/me", meRouter);
app.use("/api/v1/uploads", uploadsRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/jobs", jobsRouter);
app.use("/api/v1/runs", runsRouter);
app.use("/api/v1", diffsetsRouter);
app.use("/api/v1", exportsRouter);

// 404 for unmatched API routes, so a typo returns JSON rather than HTML.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "No such endpoint." });
});

// Error boundary. Every async handler is wrapped (see util/http.ts `wrap`), so
// a rejected promise arrives here instead of becoming an unhandled rejection
// that kills the process. Internal details are logged, never returned.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[DD84] unhandled error", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong." });
});

// Last-resort guards. Reaching either of these is a bug worth fixing, but an
// API that stays up while logging loudly beats one that exits on a transient
// database error.
process.on("unhandledRejection", (reason) => {
  console.error("[DD84] unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[DD84] uncaughtException", err);
});

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => console.log(`Down Dirty 84 API listening on :${port}`));
