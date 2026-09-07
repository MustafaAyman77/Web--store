import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { getById, findByPhone } from "../controllers/customers.controller.js";

const router = Router();

router.get("/", asyncHandler(findByPhone)); // ?phone=01xxxxxxxxx
router.get("/:id", asyncHandler(getById));

export default router;
