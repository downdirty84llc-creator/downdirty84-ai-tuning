import { Router } from "express";
import { getBrandProfile } from "./brand_profile.js";
export const brandRouter = Router();
brandRouter.get("/profile", (_req, res) => {
    res.json(getBrandProfile());
});
