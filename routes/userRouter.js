const express = require("express");
const userController = require("../controllers/userController");
const { authMiddleware } = require("../middlewares/auth_middleware");
const { trackNotificationOpen } = require("../controllers/analyticsController");
const router = express.Router();

router.post("/login", userController.login);
router.post("/signup", userController.signup);
router.post("/me", authMiddleware, userController.me);

router.post("/fcm-token", authMiddleware, userController.saveFcmToken);

router.post("/heartbeat", authMiddleware, userController.updateUserActivity);

router.post(
  "/complete-onboarding",
  authMiddleware,
  userController.completeOnboarding
);

router.post("/notification-opened", authMiddleware, trackNotificationOpen);

// Article Education Routes
router.get(
  "/article-education",
  authMiddleware,
  userController.getArticleEducation
);
router.post(
  "/article-education/complete",
  authMiddleware,
  userController.completeArticleEducation
);

module.exports = router;
