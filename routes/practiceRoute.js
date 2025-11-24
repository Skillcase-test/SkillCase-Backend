const express = require("express");
const {
  getFlashSetByProf,
  getFlahsCards,
  saveUserChapterState,
  getUserChapterState,
} = require("../controllers/practiceController");
const router = express.Router();

router.get("/allFlashSet/:prof_level", getFlashSetByProf);
router.get("/getFlashCards/:set_id", getFlahsCards);
router.post("/saveFS", saveUserChapterState);
router.get("/getFS/:set_id", getUserChapterState);
module.exports = router;
