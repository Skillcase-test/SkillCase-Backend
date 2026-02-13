const express = require("express");
const {
  getStreakData,
  logStreakPoints,
  getLastChapterProgress,
  saveFlippedCard,
} = require("../controllers/streakController");
const router = express.Router();

router.get("/", getStreakData);
router.post("/log", logStreakPoints);
router.get("/last-chapter", getLastChapterProgress);
router.post("/flip", saveFlippedCard);

module.exports = router;
