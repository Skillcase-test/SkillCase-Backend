const express = require("express");
const multer = require("multer");
const {
  createConversation,
  getAllConversations,
  deleteConversation,
} = require("../controllers/conversationController");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post(
  "/create",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "json", maxCount: 1 },
  ]),
  createConversation
);
router.get("/all", getAllConversations);
router.delete("/:conversation_id", deleteConversation);

module.exports = router;
