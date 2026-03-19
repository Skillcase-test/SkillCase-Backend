const express = require("express");
const multer = require("multer");
const {
  getSectionsByLevel,
  updateDemoClass,
  updateSalaryInfo,
  updateTalkToTeam,
  uploadSectionImage,
} = require("../controllers/landingPageController");
const {
  authMiddleware,
  authorizeRole,
} = require("../middlewares/auth_middleware");

const router = express.Router();

const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Public
router.get("/sections/:level", authMiddleware, getSectionsByLevel);

// Admin
router.put(
  "/demo-class/:level",
  authMiddleware,
  authorizeRole("admin"),
  updateDemoClass,
);
router.put(
  "/salary-info/:level",
  authMiddleware,
  authorizeRole("admin"),
  updateSalaryInfo,
);
router.put(
  "/talk-to-team/:level",
  authMiddleware,
  authorizeRole("admin"),
  updateTalkToTeam,
);
router.post(
  "/upload/:section/:level",
  authMiddleware,
  authorizeRole("admin"),
  upload.single("image"),
  uploadSectionImage,
);

module.exports = router;
