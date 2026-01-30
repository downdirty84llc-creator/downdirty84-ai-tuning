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

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => console.log(`Down Dirty 84 API listening on :${port}`));
