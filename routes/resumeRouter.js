const express = require("express");
const multer = require("multer");
const {
  extractResume,
  saveResume,
  listResumes,
  getResume,
  updateResume,
  deleteResume,
} = require("../controllers/resumeController");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

router.post("/extract", upload.single("file"), extractResume);

router.post("/save", saveResume);
router.get("/list", listResumes);
router.get("/:resume_id", getResume);
router.put("/:resume_id", updateResume);
router.delete("/:resume_id", deleteResume);

module.exports = router;
