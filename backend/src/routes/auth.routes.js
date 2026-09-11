import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { sendOtp, verifyOtpCode, logout } from "../controllers/auth.controller.js";
import { limitSendOtpIp, limitSendOtpPhone, limitVerifyOtp } from "../middleware/rate-limit.middleware.js";

const router = Router();

router.post("/send-otp", limitSendOtpIp, limitSendOtpPhone, asyncHandler(sendOtp));
router.post("/verify-otp", limitVerifyOtp, asyncHandler(verifyOtpCode));
router.post("/logout", asyncHandler(logout));

export default router;
