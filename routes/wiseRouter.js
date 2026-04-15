const express = require("express");
const {
  getBatches,
  updateBatchStatus,
  getDashboardData,
  getLeaderboard,
  handleWiseWebhook,
} = require("../controllers/wiseController");

const router = express.Router();

function verifyWiseAccessCode(req, res, next) {
  if (req.method === "OPTIONS") return next();

  const code = req.headers["x-wise-access-code"];
  const validCode = process.env.WISE_ACCESS_CODE;

  if (!validCode) {
    console.error("[Wise] WISE_ACCESS_CODE is not set in environment");
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (code === validCode) return next();
  return res.status(401).json({ error: "Invalid access code" });
}

function verifyWiseWebhook(req, res, next) {
  const authKey =
    req.headers["authorization"] || req.headers["x-wise-auth-key"];
  const expectedKey = process.env.WISE_WEBHOOK_SECRET;

  // If no secret is configured, log a warning but allow (useful during setup)
  if (!expectedKey) {
    console.warn(
      "[Wise] WISE_WEBHOOK_SECRET not set — accepting webhook without verification",
    );
    return next();
  }

  if (!authKey || authKey !== expectedKey) {
    console.error("[Wise] Webhook auth failed. Received:", authKey);
    return res.status(401).json({ error: "Unauthorized webhook" });
  }

  return next();
}

// Public route — called by Wise directly
router.post("/webhook", verifyWiseWebhook, handleWiseWebhook);

// Protected routes — called by our dashboard
router.use(verifyWiseAccessCode);
router.get("/batches", getBatches);
router.patch("/batches/:batchId/status", updateBatchStatus);
router.get("/dashboard-data", getDashboardData);
router.get("/leaderboard", getLeaderboard);

module.exports = router;
