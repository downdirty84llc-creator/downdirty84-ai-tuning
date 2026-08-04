import { Router } from "express";
import { requireAuth } from "../middleware/session.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, (req, res) => {
  return res.json({ id: req.user!.id, email: req.user!.email });
});
