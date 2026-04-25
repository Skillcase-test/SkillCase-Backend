const express = require("express");
const {
  listAdminUsers,
  updateUserRole,
  getUserPermissions,
  putUserPermissions,
  getUserWiseAccess,
  putUserWiseAccess,
  getUserTermsAccess,
  putUserTermsAccess,
  getCurrentSessionAdminAccess,
} = require("../controllers/adminAccessController");
const {
  requireSuperAdmin,
} = require("../middlewares/admin_permission_middleware");

const router = express.Router();

router.get("/me", getCurrentSessionAdminAccess);

router.get("/users", requireSuperAdmin, listAdminUsers);
router.patch("/users/:userId/role", requireSuperAdmin, updateUserRole);
router.get("/users/:userId/permissions", requireSuperAdmin, getUserPermissions);
router.put("/users/:userId/permissions", requireSuperAdmin, putUserPermissions);
router.get("/users/:userId/wise-access", requireSuperAdmin, getUserWiseAccess);
router.put("/users/:userId/wise-access", requireSuperAdmin, putUserWiseAccess);
router.get("/users/:userId/terms-access", requireSuperAdmin, getUserTermsAccess);
router.put("/users/:userId/terms-access", requireSuperAdmin, putUserTermsAccess);

module.exports = router;
