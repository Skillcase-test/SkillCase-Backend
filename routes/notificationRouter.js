const express = require("express");

const {
  sendNotification,
  broadcastNotification,
  getAvailableVersions,
} = require("../controllers/notificationController");
const {
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");
const { ADMIN_MODULES, ADMIN_ACTIONS } = require("../constants/adminPermissions");

const router = express.Router();

router.post(
  "/send",
  requireAdminPermission(ADMIN_MODULES.NOTIFICATIONS, ADMIN_ACTIONS.CREATE),
  sendNotification,
);
router.post(
  "/broadcast",
  requireAdminPermission(ADMIN_MODULES.NOTIFICATIONS, ADMIN_ACTIONS.CREATE),
  broadcastNotification,
);
router.get(
  "/versions",
  requireAdminPermission(ADMIN_MODULES.NOTIFICATIONS, ADMIN_ACTIONS.VIEW),
  getAvailableVersions,
);

module.exports = router;
