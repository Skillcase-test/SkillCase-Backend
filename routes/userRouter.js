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
router.post("/app-version", authMiddleware, userController.updateAppVersion);

router.post(
  "/complete-onboarding",
  authMiddleware,
  userController.completeOnboarding,
);

router.post(
  "/complete-a1-onboarding",
  authMiddleware,
  userController.completeA1Onboarding,
);

router.post(
  "/complete-a2-onboarding",
  authMiddleware,
  userController.completeA2Onboarding,
);

router.post("/accept-terms", authMiddleware, userController.acceptTerms);

router.post("/notification-opened", authMiddleware, trackNotificationOpen);

// Article Education Routes
router.get(
  "/article-education",
  authMiddleware,
  userController.getArticleEducation,
);
router.post(
  "/article-education/complete",
  authMiddleware,
  userController.completeArticleEducation,
);

// News Hint Routes
router.get("/news-hint", authMiddleware, userController.getNewsHintStatus);
router.post("/news-hint/seen", authMiddleware, userController.markNewsHintSeen);

// Profile Routes
router.get("/profile", authMiddleware, userController.getProfile);
router.put("/profile", authMiddleware, userController.updateProfile);

module.exports = router;
