const express = require("express");
const { syncAuthMiddleware } = require("../middlewares/sync_auth_middleware");
const syncController = require("../controllers/syncController");

const router = express.Router();

router.post(
  "/user/create",
  syncAuthMiddleware,
  syncController.receiveUserCreate,
);
router.put(
  "/user/profile",
  syncAuthMiddleware,
  syncController.receiveProfileUpdate,
);
router.get("/user/lookup", syncAuthMiddleware, syncController.lookupUser);

module.exports = router;
