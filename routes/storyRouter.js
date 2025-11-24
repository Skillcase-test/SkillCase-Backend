const express = require("express");
const {
  getStories,
  getStoryBySlug,
} = require("../controllers/storyController");
const router = express.Router();

router.get("/", getStories);
router.get("/:slug", getStoryBySlug);
module.exports = router;
