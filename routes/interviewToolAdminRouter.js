const express = require("express");
const router = express.Router();
const {
  listPositions,
  getPositionById,
  getUploadUrl,
  createPosition,
  updatePosition,
  updatePositionStatus,
  getCandidatesByPosition,
  getCandidateSubmissionDetail,
  reviewCandidateSubmission,
  deletePosition,
} = require("../controllers/interviewToolAdminController");

router.get("/positions", listPositions);
router.get("/positions/:positionId", getPositionById);
router.post("/upload-url", getUploadUrl);
router.post("/positions", createPosition);
router.put("/positions/:positionId", updatePosition);
router.delete("/positions/:positionId", deletePosition);
router.patch("/positions/:positionId/status", updatePositionStatus);
router.get("/positions/:positionId/candidates", getCandidatesByPosition);
router.get(
  "/positions/:positionId/candidates/:submissionId",
  getCandidateSubmissionDetail,
);
router.patch(
  "/positions/:positionId/candidates/:submissionId/review",
  reviewCandidateSubmission,
);

module.exports = router;
