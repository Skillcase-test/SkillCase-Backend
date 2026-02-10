const express = require("express");
const router = express.Router();
const multer = require("multer");

const a2Admin = require("../../controllers/a2/a2AdminController");
// Configure multer for file uploads

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/json" ||
      file.mimetype === "audio/mpeg" ||
      file.mimetype === "audio/mp3" ||
      file.mimetype.startsWith("image/")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

// Upload routes - JSON files + optional media
router.post(
  "/upload/flashcard",
  upload.single("file"),
  a2Admin.uploadFlashcard,
);
router.post("/upload/grammar", upload.single("file"), a2Admin.uploadGrammar);
router.post(
  "/upload/listening",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  a2Admin.uploadListening,
);
router.post("/upload/speaking", upload.single("file"), a2Admin.uploadSpeaking);
router.post(
  "/upload/reading",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  a2Admin.uploadReading,
);
router.post("/upload/test", upload.single("file"), a2Admin.uploadTest);

// Chapter management
router.get("/chapters/:module", a2Admin.getChapters);
router.put("/reorder/:module", a2Admin.reorderChapters);
router.delete("/delete/:module/:chapterId", a2Admin.deleteChapter);

// Templates
router.get("/template/:module", a2Admin.getTemplate);
module.exports = router;
