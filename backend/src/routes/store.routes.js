import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { publicStore, publicZones } from "../controllers/store.controller.js";

const router = Router();

router.get("/store", asyncHandler(publicStore));
router.get("/delivery-zones", asyncHandler(publicZones));

export default router;
