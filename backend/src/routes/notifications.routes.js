import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireCustomer } from "../middleware/customer-auth.middleware.js";
import { list, count, read, readAll } from "../controllers/notifications.controller.js";

const router = Router();

router.use(requireCustomer);

router.get("/", asyncHandler(list));
router.get("/unread-count", asyncHandler(count));
router.patch("/read-all", asyncHandler(readAll));
router.patch("/:id/read", asyncHandler(read));

export default router;
