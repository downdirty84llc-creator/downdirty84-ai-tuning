import { Router } from "express";
import { requireAuth } from "../middleware/session.js";
import { requireAdmin, isAdminEmail } from "../middleware/admin.js";
import { wrap } from "../util/http.js";
import * as link from "../services/dd84-link/link.service.js";

export const dd84LinkRouter = Router();
const actor = async (req: import("express").Request): Promise<link.Actor> => {
  if (req.headers.authorization) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization);
    if (!match) throw new link.LinkError(401, "Invalid device token");
    return link.deviceActor(match[1]);
  }
  if (!req.user) throw new link.LinkError(401, "Login required");
  return { userId: req.user.id, admin: isAdminEmail(req.user.email) };
};
dd84LinkRouter.post(
  "/device/challenge",
  wrap(async (req, res) => res.json(await link.challenge(req.body?.serial))),
);
dd84LinkRouter.post(
  "/device/authenticate",
  wrap(async (req, res) => res.json(await link.authenticate(req.body ?? {}))),
);
dd84LinkRouter.get(
  "/",
  requireAuth,
  wrap(async (req, res) => res.json(await link.overview(await actor(req)))),
);
dd84LinkRouter.post(
  "/devices",
  requireAdmin,
  wrap(async (req, res) =>
    res.status(201).json(await link.enroll(req.body ?? {}, await actor(req))),
  ),
);
dd84LinkRouter.post(
  "/vehicle/session",
  wrap(async (req, res) =>
    res
      .status(201)
      .json(await link.openSession(req.body ?? {}, await actor(req))),
  ),
);
dd84LinkRouter.post(
  "/logs",
  wrap(async (req, res) =>
    res
      .status(202)
      .json(await link.uploadLog(req.body ?? {}, await actor(req))),
  ),
);
dd84LinkRouter.post(
  "/sessions/:id/backup",
  wrap(async (req, res) =>
    res.json(await link.backup(req.params.id, await actor(req))),
  ),
);
dd84LinkRouter.post(
  "/sessions/:id/calibrations",
  requireAdmin,
  wrap(async (req, res) =>
    res.status(201).json(await link.release(req.params.id, await actor(req))),
  ),
);
dd84LinkRouter.post(
  "/sessions/:id/install",
  wrap(async (req, res) => {
    const result = await link.install(
      req.params.id,
      req.body ?? {},
      await actor(req),
    );
    return res.status(result.installed ? 200 : 409).json(result);
  }),
);
dd84LinkRouter.post(
  "/sessions/:id/recover",
  wrap(async (req, res) =>
    res.json(await link.recover(req.params.id, await actor(req))),
  ),
);
dd84LinkRouter.use(
  (
    err: any,
    _req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    if (err instanceof link.LinkError)
      return res
        .status(err.status)
        .json({ error: "DD84_LINK_REJECTED", message: err.message });
    if (err?.code === "23505")
      return res
        .status(409)
        .json({
          error: "CONFLICT",
          message: "Device or log sequence already exists.",
        });
    next(err);
  },
);
