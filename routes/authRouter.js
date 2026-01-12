const express = require("express");

const authController = require("../controllers/authController");

const router = express.Router();

// Signup flow (2-step)
router.post("/signup/send-otp", authController.sendSignupOtp);
router.post("/signup/verify-otp", authController.verifySignupOtp);
router.post("/signup/complete", authController.completeSignup);

// Login flow
router.post("/login/send-otp", authController.sendLoginOtp);
router.post("/login/verify-otp", authController.verifyLoginOtp);

// Resend OTP
router.post("/resend-otp", authController.resendOtp);

module.exports = router;
