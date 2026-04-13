const express = require("express");
const {
  getStreakData,
  logStreakPoints,
  getLastChapterProgress,
  saveFlippedCard,
  getTopStreakLeaderboard,
} = require("../controllers/streakController");
const router = express.Router();

router.get("/", getStreakData);
router.get("/leaderboard/top5", getTopStreakLeaderboard);
router.post("/log", logStreakPoints);
router.get("/last-chapter", getLastChapterProgress);
router.post("/flip", saveFlippedCard);

module.exports = router;
