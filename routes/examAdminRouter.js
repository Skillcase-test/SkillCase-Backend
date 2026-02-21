const express = require("express");
const router = express.Router();
const multer = require("multer");
const adminController = require("../controllers/hardcoreTestAdminController");

// Multer config for audio uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/webm",
      "audio/m4a",
      "audio/x-m4a",
      "audio/mp4",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"), false);
    }
  },
});

// Exam CRUD
router.post("/create", adminController.createExam);
router.get("/list", adminController.listExams);
router.get("/:testId", adminController.getExamDetail);
router.put("/:testId", adminController.updateExam);
router.delete("/:testId", adminController.deleteExam);

// Questions (with optional audio upload)
router.post(
  "/:testId/question",
  upload.single("audio"),
  adminController.addQuestion,
);
router.put(
  "/:testId/question/:questionId",
  upload.single("audio"),
  adminController.editQuestion,
);
router.delete("/:testId/question/:questionId", adminController.deleteQuestion);
router.put("/:testId/reorder", adminController.reorderQuestions);

// Visibility
router.post("/:testId/visibility", adminController.setVisibility);
router.get("/:testId/visibility", adminController.getVisibility);
router.delete("/:testId/visibility/:visId", adminController.removeVisibility);

// Submissions
router.get("/:testId/submissions", adminController.getSubmissions);
router.put(
  "/submission/:submissionId/reopen",
  adminController.reopenSubmission,
);
router.put(
  "/submission/:submissionId/reset-reopen",
  adminController.resetSubmissionForRetest,
);

module.exports = router;
