const express = require("express");
const router = express.Router();

const {
  optionalAuth,
  authMiddleware,
  authorizeRole,
} = require("../middlewares/auth_middleware");

const {
  checkIfNeedUpdate,
  logOtaEvent,
  getOtaStats,
} = require("../controllers/otaUpdateController");

// Check for updates
router.get("/check", optionalAuth, checkIfNeedUpdate);

// Log OTA events
router.post("/log", authMiddleware, logOtaEvent);

// Get OTA stats
router.get("/stats", authMiddleware, authorizeRole("admin"), getOtaStats);

module.exports = router;
