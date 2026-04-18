const express = require("express");
const multer = require("multer");
const {
  createConversation,
  getAllConversations,
  deleteConversation,
} = require("../controllers/conversationController");
const {
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");
const { ADMIN_MODULES, ADMIN_ACTIONS } = require("../constants/adminPermissions");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post(
  "/create",
  requireAdminPermission(ADMIN_MODULES.CONVERSATIONS, ADMIN_ACTIONS.CREATE),
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "json", maxCount: 1 },
  ]),
  createConversation
);
router.get(
  "/all",
  requireAdminPermission(ADMIN_MODULES.CONVERSATIONS, ADMIN_ACTIONS.VIEW),
  getAllConversations,
);
router.delete(
  "/:conversation_id",
  requireAdminPermission(ADMIN_MODULES.CONVERSATIONS, ADMIN_ACTIONS.DELETE),
  deleteConversation,
);

module.exports = router;
