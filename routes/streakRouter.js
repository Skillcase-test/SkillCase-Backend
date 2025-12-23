const express = require("express");
const {
  getStreakData,
  logFlashcardActivity,
  getLastChapterProgress,
  saveFlippedCard,
} = require("../controllers/streakController");
const router = express.Router();

router.get("/", getStreakData);
router.post("/log", logFlashcardActivity);
router.get("/last-chapter", getLastChapterProgress);
router.post("/flip", saveFlippedCard);

module.exports = router;
