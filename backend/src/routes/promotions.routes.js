import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { publicList, publicGet } from "../controllers/promotions.controller.js";

const router = Router();

router.get("/", asyncHandler(publicList));
router.get("/:id", asyncHandler(publicGet));

export default router;
