const express = require("express");
const multer = require("multer");
const {
  getSectionsByLevel,
  updateDemoClass,
  updateSalaryInfo,
  updateTalkToTeam,
  uploadSectionImage,
} = require("../controllers/landingPageController");
const {
  authMiddleware,
} = require("../middlewares/auth_middleware");
const {
  authorizeAdminOrSuperAdmin,
  hydrateAdminAccess,
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");
const { ADMIN_MODULES, ADMIN_ACTIONS } = require("../constants/adminPermissions");

const router = express.Router();

const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Public
router.get("/sections/:level", authMiddleware, getSectionsByLevel);

// Admin
router.put(
  "/demo-class/:level",
  authMiddleware,
  authorizeAdminOrSuperAdmin,
  hydrateAdminAccess,
  requireAdminPermission(ADMIN_MODULES.LANDING_PAGE, ADMIN_ACTIONS.EDIT),
  updateDemoClass,
);
router.put(
  "/salary-info/:level",
  authMiddleware,
  authorizeAdminOrSuperAdmin,
  hydrateAdminAccess,
  requireAdminPermission(ADMIN_MODULES.LANDING_PAGE, ADMIN_ACTIONS.EDIT),
  updateSalaryInfo,
);
router.put(
  "/talk-to-team/:level",
  authMiddleware,
  authorizeAdminOrSuperAdmin,
  hydrateAdminAccess,
  requireAdminPermission(ADMIN_MODULES.LANDING_PAGE, ADMIN_ACTIONS.EDIT),
  updateTalkToTeam,
);
router.post(
  "/upload/:section/:level",
  authMiddleware,
  authorizeAdminOrSuperAdmin,
  hydrateAdminAccess,
  requireAdminPermission(ADMIN_MODULES.LANDING_PAGE, ADMIN_ACTIONS.EDIT),
  upload.single("image"),
  uploadSectionImage,
);

module.exports = router;
