import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { create, getById } from "../controllers/orders.controller.js";

const router = Router();

router.post("/", asyncHandler(create));
router.get("/:ref", asyncHandler(getById)); // يقبل UUID أو رقم الطلب

export default router;
