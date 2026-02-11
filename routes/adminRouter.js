const express = require("express");
const multer = require("multer");
const {
  addFlashSet,
  deleteFlashSet,
} = require("../controllers/flashCardController");
const {
  checkSetName,
  getChapters,
  checkPronounceSetName,
  getPronounceChapters,
} = require("../controllers/util");
const {
  createChTest,
  createFinalTest,
} = require("../controllers/testController");
const { createInterview } = require("../controllers/interviewController");
const {
  addPronounceSet,
  deletePronounceSet,
} = require("../controllers/pronounceController");
const {
  getTest,
  deleteChTest,
  deleteFinalTest,
} = require("../controllers/testController");
const {
  getInterview,
  deleteInterview,
} = require("../controllers/interviewController");
const {
  getUserAnalytics,
  getPreviousMonthFlashCardInteractions,
  getNewUserAnalytics,
  getPreviousMonthUserCompletionRate,
  getPreviousMonthTestCompletionRate,
  getTotalUsers,
  getStoryAnalytics,
  getPronounceAnalytics,
  getConversationAnalytics,
  getUserDetailedHistory,
  getRecentActivity,
  getActiveUsersNow,
  getStreakLeaderboard,
  getStreakStats,
  getNotificationStats,
  getNotificationSummary,
  getDailyActiveUsers,
  getAllUsers,
} = require("../controllers/analyticsController");

const { getAllAgreements } = require("../controllers/agreementController");
const {
  createStory,
  updateStory,
  deleteStory,
  getStories,
} = require("../controllers/storyController");

const { uploadNotificationImage } = require("../controllers/uploadController");

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post("/addFlashCardSet", upload.single("file"), addFlashSet);
router.post("/check", checkSetName);
router.post("/addChTest", createChTest);
router.post("/addFinalTest", createFinalTest);
router.post("/addInterview", createInterview);
router.post("/deleteFlashSet", deleteFlashSet);
router.get("/getChapters/:prof_level", getChapters);

router.post("/addPronounceCardSet", upload.single("file"), addPronounceSet);
router.post("/deletePronounceSet", deletePronounceSet);
router.post("/checkPronounce", checkPronounceSetName);
router.get("/getPronounceChapters/:prof_level", getPronounceChapters);

router.get("/getTest/:prof_level", getTest);
router.post("/deleteChTest", deleteChTest);
router.post("/deleteFinalTest", deleteFinalTest);

router.get("/getInterview/:prof_level", getInterview);
router.post("/deleteInterview", deleteInterview);

router.get("/analytics", getUserAnalytics);
router.get("/analytics/user-count", getTotalUsers);
router.get("/analytics/all-users", getAllUsers);
router.get("/analytics/new-user-analytics", getNewUserAnalytics);
router.get(
  "/analytics/prev-month-interaction-analytics",
  getPreviousMonthFlashCardInteractions,
);
router.get(
  "/analytics/prev-month-user-completetion-analytics",
  getPreviousMonthUserCompletionRate,
);
router.get(
  "/analytics/prev-month-test-completetion-analytics",
  getPreviousMonthTestCompletionRate,
);

router.get("/analytics/story-analytics", getStoryAnalytics);
router.get("/analytics/pronounce-analytics", getPronounceAnalytics);
router.get("/analytics/conversation-analytics", getConversationAnalytics);
router.get("/analytics/user-history/:user_id", getUserDetailedHistory);
router.get("/analytics/recent-activity", getRecentActivity);
router.get("/analytics/daily-active-users", getDailyActiveUsers);

router.get("/analytics/active-users-now", getActiveUsersNow);

router.get("/analytics/streak-leaderboard", getStreakLeaderboard);
router.get("/analytics/streak-stats", getStreakStats);

router.get("/analytics/notification-stats", getNotificationStats);
router.get("/analytics/notification-summary", getNotificationSummary);

router.get("/agreements", getAllAgreements);

router.get("/stories", getStories);
router.post("/stories", createStory);
router.put("/stories/:slug", updateStory);
router.delete("/stories/:slug", deleteStory);

router.post(
  "/upload/notification-image",
  upload.single("image"),
  uploadNotificationImage,
);

module.exports = router;
