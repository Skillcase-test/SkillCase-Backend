const express = require("express");

const router = express.Router();

const {
  handleWebsiteLead,
  verifyFacebookWebhook,
  handleFacebookWebhook,
} = require("../controllers/leadController");

// Website form submissions
router.post("/", handleWebsiteLead);

// Facebook webhook verification
router.get("/facebook-webhook", verifyFacebookWebhook);

// Facebook lead notifications
router.post("/facebook-webhook", handleFacebookWebhook);

module.exports = router;
