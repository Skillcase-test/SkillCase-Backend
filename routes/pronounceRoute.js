const express = require("express");
const { upload } = require("../util/multer");
const router = express.Router();
const {
  asses,
  getPronounceSetByProf,
  getPronounceCards,
  getUserPronounceProgress,
  saveUserPronounceProgress,
} = require("../controllers/pronounceController");

router.post("/asses", upload.single("audio"), asses);
router.get("/allPronounceSet/:prof_level", getPronounceSetByProf);
router.get("/getPronounceCards/:pronounce_id", getPronounceCards);
router.get("/progress/:pronounce_id", getUserPronounceProgress);
router.put("/progress/:pronounce_id", saveUserPronounceProgress);

module.exports = router;
