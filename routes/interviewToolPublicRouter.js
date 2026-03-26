const express = require("express");
const router = express.Router();
const {
  getPublicPosition,
  startSubmission,
  restoreSubmission,
  createAnswerUploadUrl,
  saveAnswer,
  finishSubmission,
} = require("../controllers/interviewToolPublicController");

router.get("/public/:slug", getPublicPosition);
router.post("/public/:slug/start", startSubmission);
router.get("/public/:slug/session/:sessionToken", restoreSubmission);
router.post("/submissions/:submissionId/upload-url", createAnswerUploadUrl);
router.post("/submissions/:submissionId/answers", saveAnswer);
router.post("/submissions/:submissionId/finish", finishSubmission);

module.exports = router;
