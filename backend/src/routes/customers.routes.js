import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { getById, findByPhone, customerOrders } from "../controllers/customers.controller.js";

const router = Router();

router.get("/", asyncHandler(findByPhone)); // ?phone=01xxxxxxxxx
router.get("/:id/orders", asyncHandler(customerOrders));
router.get("/:id", asyncHandler(getById));

export default router;
