const express = require("express");
const multer = require("multer");

const router = express.Router();

const {
  createEvent,
  updateEvent,
  deleteEvent,
  getAllEvents,
  getEventRegistrations,
  permanentDeleteEvent,
  restoreEvent,
  createInstanceOverride,
} = require("../controllers/eventController");
const {
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");
const { ADMIN_MODULES, ADMIN_ACTIONS } = require("../constants/adminPermissions");

const { uploadEventImage } = require("../controllers/uploadController");

// Configure multer for event image uploads
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Admin routes
router.post(
  "/",
  requireAdminPermission(ADMIN_MODULES.EVENTS, ADMIN_ACTIONS.CREATE),
  createEvent,
);
router.put(
  "/:event_id",
  requireAdminPermission(ADMIN_MODULES.EVENTS, ADMIN_ACTIONS.EDIT),
  updateEvent,
);
router.delete(
  "/:event_id",
  requireAdminPermission(ADMIN_MODULES.EVENTS, ADMIN_ACTIONS.DELETE),
  deleteEvent,
);
router.get(
  "/",
  requireAdminPermission(ADMIN_MODULES.EVENTS, ADMIN_ACTIONS.VIEW),
  getAllEvents,
);
router.get(
  "/:event_id/registrations",
  requireAdminPermission(ADMIN_MODULES.EVENTS, ADMIN_ACTIONS.VIEW),
  getEventRegistrations,
);
router.put(
  "/:event_id/restore",
  requireAdminPermission(ADMIN_MODULES.EVENTS, ADMIN_ACTIONS.EDIT),
  restoreEvent,
);
router.delete(
  "/:event_id/permanent",
  requireAdminPermission(ADMIN_MODULES.EVENTS, ADMIN_ACTIONS.DELETE),
  permanentDeleteEvent,
);

// Instance override route
router.post(
  "/:event_id/override",
  requireAdminPermission(ADMIN_MODULES.EVENTS, ADMIN_ACTIONS.EDIT),
  createInstanceOverride,
);

// Image upload route
router.post(
  "/upload-image",
  requireAdminPermission(ADMIN_MODULES.EVENTS, ADMIN_ACTIONS.EDIT),
  upload.single("image"),
  uploadEventImage,
);

module.exports = router;
