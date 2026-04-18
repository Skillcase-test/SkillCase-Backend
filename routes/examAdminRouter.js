const express = require("express");
const router = express.Router();
const multer = require("multer");
const adminController = require("../controllers/hardcoreTestAdminController");
const {
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");
const { ADMIN_MODULES, ADMIN_ACTIONS } = require("../constants/adminPermissions");

// Multer config — accepts audio AND image files for exam questions
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      // Audio
      "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg",
      "audio/webm", "audio/m4a", "audio/x-m4a", "audio/mp4",
      // Images
      "image/jpeg", "image/jpg", "image/png", "image/gif",
      "image/webp", "image/svg+xml",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only audio or image files are allowed"), false);
    }
  },
});

// Fields accepted per question request:
//   audio            — optional audio file
//   question_image_file — optional image shown above question text
//   image_block_file    — optional image for image_block question type
//   option_image_file_0 … option_image_file_9 — optional image per option slot
const questionUploadFields = upload.fields([
  { name: "audio", maxCount: 1 },
  { name: "question_image_file", maxCount: 1 },
  { name: "image_block_file", maxCount: 1 },
  ...Array.from({ length: 10 }, (_, i) => ({
    name: `option_image_file_${i}`,
    maxCount: 1,
  })),
]);

// Exam CRUD
router.post(
  "/create",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.CREATE),
  adminController.createExam,
);
router.get(
  "/list",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.VIEW),
  adminController.listExams,
);
router.get(
  "/:testId",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.VIEW),
  adminController.getExamDetail,
);
router.put(
  "/:testId",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.EDIT),
  adminController.updateExam,
);
router.delete(
  "/:testId",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.DELETE),
  adminController.deleteExam,
);

// Questions (with optional audio upload)
router.post(
  "/:testId/question",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.CREATE),
  questionUploadFields,
  adminController.addQuestion,
);
router.put(
  "/:testId/question/:questionId",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.EDIT),
  questionUploadFields,
  adminController.editQuestion,
);
router.delete(
  "/:testId/question/:questionId",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.DELETE),
  adminController.deleteQuestion,
);
router.put(
  "/:testId/reorder",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.EDIT),
  adminController.reorderQuestions,
);

// Visibility
router.post(
  "/:testId/visibility",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.EDIT),
  adminController.setVisibility,
);
router.get(
  "/:testId/visibility",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.VIEW),
  adminController.getVisibility,
);
router.delete(
  "/:testId/visibility/:visId",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.DELETE),
  adminController.removeVisibility,
);

// Submissions
router.get(
  "/:testId/submissions",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.VIEW),
  adminController.getSubmissions,
);
router.put(
  "/submission/:submissionId/reopen",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.EDIT),
  adminController.reopenSubmission,
);
router.put(
  "/submission/:submissionId/reset-reopen",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.EDIT),
  adminController.resetSubmissionForRetest,
);
router.get(
  "/submission/:submissionId/detail",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.VIEW),
  adminController.getSubmissionDetail,
);
router.put(
  "/submission/:submissionId/answer/:questionId/override",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.EDIT),
  adminController.overrideAnswer,
);
router.put(
  "/submission/:submissionId/answer/:questionId/override-points",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.EDIT),
  adminController.overrideAnswerPoints,
);

router.get(
  "/:testId/export/excel",
  requireAdminPermission(ADMIN_MODULES.EXAM, ADMIN_ACTIONS.VIEW),
  adminController.exportSubmissionsExcel,
);

module.exports = router;
