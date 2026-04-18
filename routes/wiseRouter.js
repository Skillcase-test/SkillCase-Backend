const express = require("express");
const {
  getBatches,
  updateBatchStatus,
  getDashboardData,
  getLeaderboard,
  handleWiseWebhook,
} = require("../controllers/wiseController");
const { authMiddleware } = require("../middlewares/auth_middleware");
const {
  hydrateAdminAccess,
  authorizeAdminOrSuperAdmin,
  requireAdminPermission,
  requireWiseBatchAccess,
} = require("../middlewares/admin_permission_middleware");
const { ADMIN_MODULES, ADMIN_ACTIONS } = require("../constants/adminPermissions");

const router = express.Router();

function verifyWiseWebhook(req, res, next) {
  const authKey =
    req.headers["authorization"] || req.headers["x-wise-auth-key"];
  const expectedKey = process.env.WISE_WEBHOOK_SECRET;

  if (!expectedKey) {
    console.warn(
      "[Wise] WISE_WEBHOOK_SECRET not set - accepting webhook without verification",
    );
    return next();
  }

  if (!authKey || authKey !== expectedKey) {
    console.error("[Wise] Webhook auth failed. Received:", authKey);
    return res.status(401).json({ error: "Unauthorized webhook" });
  }

  return next();
}

router.post("/webhook", verifyWiseWebhook, handleWiseWebhook);

router.use(authMiddleware, authorizeAdminOrSuperAdmin, hydrateAdminAccess);
router.get(
  "/batches",
  requireAdminPermission(ADMIN_MODULES.WISE, ADMIN_ACTIONS.VIEW),
  getBatches,
);
router.patch(
  "/batches/:batchId/status",
  requireAdminPermission(ADMIN_MODULES.WISE, ADMIN_ACTIONS.EDIT),
  requireWiseBatchAccess((req) => req.params.batchId),
  updateBatchStatus,
);
router.get(
  "/dashboard-data",
  requireAdminPermission(ADMIN_MODULES.WISE, ADMIN_ACTIONS.VIEW),
  requireWiseBatchAccess((req) => req.query.batchId),
  getDashboardData,
);
router.get(
  "/leaderboard",
  requireAdminPermission(ADMIN_MODULES.WISE, ADMIN_ACTIONS.VIEW),
  getLeaderboard,
);

module.exports = router;
