const express = require("express");
const { getDailyReport, getOpsReport } = require("../controllers/internalReportController");
const {
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");
const { ADMIN_MODULES, ADMIN_ACTIONS } = require("../constants/adminPermissions");

const router = express.Router();

router.get(
  "/daily-report",
  requireAdminPermission(ADMIN_MODULES.INTERNAL, ADMIN_ACTIONS.VIEW),
  getDailyReport,
);
router.get(
  "/ops-report",
  requireAdminPermission(ADMIN_MODULES.INTERNAL, ADMIN_ACTIONS.VIEW),
  getOpsReport,
);

module.exports = router;
