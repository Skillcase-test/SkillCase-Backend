const express = require("express");

const {
  sendNotification,
  broadcastNotification,
} = require("../controllers/notificationController");

const router = express.Router();

router.post("/send", sendNotification);
router.post("/broadcast", broadcastNotification);

module.exports = router;
