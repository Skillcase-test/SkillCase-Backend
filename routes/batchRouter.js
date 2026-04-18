const express = require("express");
const router = express.Router();
const batchController = require("../controllers/batchController");
const {
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");
const { ADMIN_MODULES, ADMIN_ACTIONS } = require("../constants/adminPermissions");

// CRUD
router.post(
  "/",
  requireAdminPermission(ADMIN_MODULES.BATCH, ADMIN_ACTIONS.CREATE),
  batchController.createBatch,
);
router.get(
  "/",
  requireAdminPermission(ADMIN_MODULES.BATCH, ADMIN_ACTIONS.VIEW),
  batchController.listBatches,
);
router.put(
  "/:batchId",
  requireAdminPermission(ADMIN_MODULES.BATCH, ADMIN_ACTIONS.EDIT),
  batchController.updateBatch,
);
router.delete(
  "/:batchId",
  requireAdminPermission(ADMIN_MODULES.BATCH, ADMIN_ACTIONS.DELETE),
  batchController.deleteBatch,
);

// Student assignment
router.get(
  "/:batchId/students",
  requireAdminPermission(ADMIN_MODULES.BATCH, ADMIN_ACTIONS.VIEW),
  batchController.getBatchStudents,
);
router.post(
  "/:batchId/students",
  requireAdminPermission(ADMIN_MODULES.BATCH, ADMIN_ACTIONS.EDIT),
  batchController.assignStudents,
);
router.delete(
  "/:batchId/students/:userId",
  requireAdminPermission(ADMIN_MODULES.BATCH, ADMIN_ACTIONS.DELETE),
  batchController.removeStudent,
);

// List all students
router.get(
  "/students/all",
  requireAdminPermission(ADMIN_MODULES.BATCH, ADMIN_ACTIONS.VIEW),
  batchController.listAllStudents,
);

module.exports = router;
