const express = require("express");
const { getNewsFeed, getNewsById } = require("../controllers/newsController");

const router = express.Router();

router.get("/", getNewsFeed);
router.get("/:id", getNewsById);

module.exports = router;
