const express = require("express");

const {
  sendNotification,
  broadcastNotification,
  getAvailableVersions,
} = require("../controllers/notificationController");

const router = express.Router();

router.post("/send", sendNotification);
router.post("/broadcast", broadcastNotification);
router.get("/versions", getAvailableVersions);

module.exports = router;
