const express = require("express");
const multer = require("multer");

const a1Admin = require("../../controllers/a1/a1AdminController");
const {
  requireAdminPermission,
} = require("../../middlewares/admin_permission_middleware");
const {
  ADMIN_MODULES,
  ADMIN_ACTIONS,
} = require("../../constants/adminPermissions");

const router = express.Router();
router.use(requireAdminPermission(ADMIN_MODULES.CONTENT, ADMIN_ACTIONS.MANAGE));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const lowerName = (file.originalname || "").toLowerCase();
    const isZip =
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      lowerName.endsWith(".zip");

    if (
      file.mimetype === "application/json" ||
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("audio/") ||
      isZip
    ) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

router.post(
  "/upload/flashcard",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "images", maxCount: 200 },
    { name: "imagesZip", maxCount: 1 },
  ]),
  a1Admin.uploadFlashcard,
);
router.post("/upload/grammar", upload.single("file"), a1Admin.uploadGrammar);
router.post(
  "/upload/reading",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  a1Admin.uploadReading,
);
router.post(
  "/upload/listening",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "audio", maxCount: 200 },
    { name: "itemAudios", maxCount: 200 },
    { name: "images", maxCount: 100 },
  ]),
  a1Admin.uploadListening,
);
router.post("/upload/speaking", upload.single("file"), a1Admin.uploadSpeaking);
router.post("/upload/test", upload.single("file"), a1Admin.uploadTest);

router.get("/chapters/:module", a1Admin.getChapters);
router.put("/reorder/:module", a1Admin.reorderChapters);
router.delete("/delete/:module/:chapterId", a1Admin.deleteChapter);

router.get("/template/:module", a1Admin.getTemplate);

module.exports = router;
