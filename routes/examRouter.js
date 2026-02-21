const express = require("express");
const router = express.Router();
const examController = require("../controllers/hardcoreTestController");

// Student exam endpoints
router.get("/visible", examController.getVisibleExams);
router.get("/:testId", examController.getExamInfo);
router.post("/:testId/start", examController.startExam);
router.get("/:testId/time", examController.getTimeRemaining);
router.post("/:testId/answer", examController.saveAnswer);
router.post("/:testId/warning", examController.recordWarning);
router.post("/:testId/submit", examController.submitExam);
router.get("/:testId/result", examController.getResult);

module.exports = router;
