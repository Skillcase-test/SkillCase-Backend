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
} = require("../controllers/analyticsController");

const { getAllAgreements } = require("../controllers/agreementController");

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
router.get("/analytics/new-user-analytics", getNewUserAnalytics);
router.get(
  "/analytics/prev-month-interaction-analytics",
  getPreviousMonthFlashCardInteractions
);
router.get(
  "/analytics/prev-month-user-completetion-analytics",
  getPreviousMonthUserCompletionRate
);
router.get(
  "/analytics/prev-month-test-completetion-analytics",
  getPreviousMonthTestCompletionRate
);

router.get("/agreements", getAllAgreements);

module.exports = router;
