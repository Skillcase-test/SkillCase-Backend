const express = require("express");
const multer = require("multer");
const { uploadProfilePhoto } = require("../controllers/uploadController");
const { authMiddleware } = require("../middlewares/auth_middleware");
const router = express.Router();
// Configure multer for file uploads
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});
router.post(
  "/profile-photo",
  authMiddleware,
  upload.single("photo"),
  uploadProfilePhoto
);
module.exports = router;
