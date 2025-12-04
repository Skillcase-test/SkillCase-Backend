const express = require("express");
const {
  getStories,
  getStoryBySlug,
  markStoryAsComplete,
} = require("../controllers/storyController");
const router = express.Router();

router.get("/", getStories);
router.get("/:slug", getStoryBySlug);
router.put("/complete/:story_id", markStoryAsComplete);

module.exports = router;
