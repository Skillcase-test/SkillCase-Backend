const express = require("express");

const router = express.Router();

const {
  getConversationsByLevel,
  getConversationById,
  updateProgress,
} = require("../controllers/conversationController");

router.get("/sets/:prof_level", getConversationsByLevel);
router.get("/:conversation_id", getConversationById);
router.put("/:conversation_id/progress", updateProgress);

module.exports = router;
